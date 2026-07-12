use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;
use async_trait::async_trait;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::settings::{BackendSettings, SettingsStore, normalize_codex_extra_args};
use crate::status::{LaunchStatus, StatusStore};

#[cfg(windows)]
const POST_LAUNCH_COMPUTER_USE_GUARD_SECONDS: &[u64] = &[0, 5, 15, 30, 60, 120, 180, 240, 300];
#[cfg_attr(not(windows), allow(dead_code))]
const POST_LAUNCH_COMPUTER_USE_GUARD_STABLE_ATTEMPTS: usize = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodexLaunch {
    Process {
        command: Vec<String>,
        wait_strategy: ProcessWaitStrategy,
        macos_cleanup_policy: Option<MacosCleanupPolicy>,
    },
    PackagedActivation {
        app_user_model_id: String,
        arguments: String,
        process_id: Option<u32>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessWaitStrategy {
    TrackedChild,
    ExternalWaitCommand,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MacosCleanupPolicy {
    QuitIfNotPreviouslyRunning,
    SkipQuitBecauseAlreadyRunning,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowsProcessControlStrategy {
    NativeWindowsApi,
}

#[cfg(windows)]
pub fn windows_process_control_strategy() -> WindowsProcessControlStrategy {
    WindowsProcessControlStrategy::NativeWindowsApi
}

impl CodexLaunch {
    pub fn process_id(&self) -> Option<u32> {
        match self {
            Self::PackagedActivation { process_id, .. } => *process_id,
            Self::Process { .. } => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct LaunchOptions {
    pub app_dir: Option<PathBuf>,
    pub protocol_proxy_port: u16,
    pub status_store: StatusStore,
}

impl Default for LaunchOptions {
    fn default() -> Self {
        Self {
            app_dir: None,
            protocol_proxy_port: 57321,
            status_store: StatusStore::default(),
        }
    }
}

#[derive(Clone)]
pub struct LaunchHandle {
    pub protocol_proxy_port: u16,
    pub app_dir: PathBuf,
    pub launch: CodexLaunch,
    pub status_store: StatusStore,
    hooks: Arc<dyn LaunchHooks>,
}

impl std::fmt::Debug for LaunchHandle {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("LaunchHandle")
            .field("protocol_proxy_port", &self.protocol_proxy_port)
            .field("app_dir", &self.app_dir)
            .field("launch", &self.launch)
            .field("status_store", &self.status_store)
            .finish_non_exhaustive()
    }
}

impl LaunchHandle {
    pub async fn wait_for_codex_exit(&self) -> anyhow::Result<()> {
        let result = self.hooks.wait_for_codex_exit(&self.launch).await;
        self.hooks
            .shutdown_owned_resources(self.protocol_proxy_port)
            .await;
        result
    }

    pub async fn shutdown_owned_resources(&self) {
        self.hooks
            .shutdown_owned_resources(self.protocol_proxy_port)
            .await;
        let stopped = launch_status(
            "stopped",
            "ChatGPT++ protocol proxy stopped by explicit app exit",
            self.protocol_proxy_port,
            &self.app_dir,
        );
        let _ = self.status_store.save_latest(&stopped);
        self.hooks.write_status("stopped").await;
    }
}

#[async_trait]
pub trait LaunchHooks: Send + Sync {
    fn resolve_app_dir(
        &self,
        app_dir: Option<&Path>,
        settings: &BackendSettings,
    ) -> anyhow::Result<PathBuf>;
    fn select_protocol_proxy_port(&self, requested: u16) -> u16;
    async fn load_settings(&self) -> anyhow::Result<BackendSettings>;
    fn apply_codex_home(&self, settings: &BackendSettings) -> anyhow::Result<()> {
        if !settings.relay_profiles_enabled {
            return Ok(());
        }
        let home = crate::codex_home::default_codex_home_dir();
        crate::codex_home_apply::reconcile(
            &home,
            crate::codex_home_apply::CodexHomeReconcileIntent::ApplyActiveProfile { settings },
        )?;
        Ok(())
    }
    async fn run_provider_sync(&self) -> anyhow::Result<()>;
    async fn ensure_computer_use_config(&self, _settings: &BackendSettings) -> anyhow::Result<()> {
        Ok(())
    }
    async fn ensure_plugin_marketplace_config(
        &self,
        _settings: &BackendSettings,
    ) -> anyhow::Result<()> {
        Ok(())
    }
    fn sanitize_historical_model_suffixes(
        &self,
    ) -> anyhow::Result<crate::codex_sqlite::SanitizeModelSuffixResult> {
        let home = crate::codex_home::default_codex_home_dir();
        crate::codex_sqlite::sanitize_historical_model_suffixes(&home)
    }
    async fn start_protocol_proxy(&self, protocol_proxy_port: u16) -> anyhow::Result<()>;
    async fn launch_codex(
        &self,
        app_dir: &Path,
        settings: &BackendSettings,
        extra_args: &[String],
    ) -> anyhow::Result<CodexLaunch>;
    async fn start_computer_use_guard_watchdog(
        &self,
        _settings: &BackendSettings,
    ) -> anyhow::Result<()> {
        Ok(())
    }
    async fn write_status(&self, status: &str);
    async fn wait_for_codex_exit(&self, launch: &CodexLaunch) -> anyhow::Result<()>;
    async fn shutdown_owned_resources(&self, protocol_proxy_port: u16);
    async fn terminate_codex(&self, launch: &CodexLaunch);
}

#[derive(Default)]
pub struct DefaultLaunchHooks {
    child: Mutex<Option<Child>>,
    protocol_proxy: Mutex<Option<ProtocolProxyRuntime>>,
    computer_use_guard_watchdog: Mutex<Option<ComputerUseGuardWatchdogRuntime>>,
    computer_use_guard_artifacts: Mutex<Option<crate::computer_use_guard::GuardArtifacts>>,
}

struct ProtocolProxyRuntime {
    shutdown: tokio::sync::oneshot::Sender<()>,
    task: tokio::task::JoinHandle<()>,
}

struct ComputerUseGuardWatchdogRuntime {
    shutdown: tokio::sync::oneshot::Sender<()>,
    task: tokio::task::JoinHandle<()>,
}

pub async fn launch_codex(options: LaunchOptions) -> anyhow::Result<LaunchHandle> {
    launch_codex_with_hooks(options, DefaultLaunchHooks::shared()).await
}

pub async fn launch_codex_with_hooks<H>(
    options: LaunchOptions,
    hooks: H,
) -> anyhow::Result<LaunchHandle>
where
    H: IntoLaunchHooks,
{
    let hooks = hooks.into_launch_hooks();
    let mut protocol_proxy_port = hooks.select_protocol_proxy_port(options.protocol_proxy_port);
    let settings = hooks.load_settings().await?;
    let app_dir = hooks.resolve_app_dir(options.app_dir.as_deref(), &settings)?;
    let status_store = options.status_store.clone();
    let mut launched = None;

    let result: anyhow::Result<LaunchHandle> = async {
        hooks.apply_codex_home(&settings)?;
        if settings.provider_sync_enabled {
            hooks.run_provider_sync().await?;
        }
        if let Err(error) = hooks.ensure_plugin_marketplace_config(&settings).await {
            let _ = crate::diagnostic_log::append_diagnostic_log(
                "launch_runtime.plugin_marketplace_config_failed_nonfatal",
                serde_json::json!({
                    "message": error.to_string()
                }),
            );
        }
        if settings.computer_use_guard_enabled {
            hooks.ensure_computer_use_config(&settings).await?;
        }
        match hooks.sanitize_historical_model_suffixes() {
            Ok(result) if result.updated > 0 => {
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "launch_runtime.sanitize_historical_model_suffixes",
                    serde_json::json!({
                        "scanned": result.scanned,
                        "updated": result.updated
                    }),
                );
            }
            Ok(_) => {}
            Err(error) => {
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "launch_runtime.sanitize_historical_model_suffixes_failed",
                    serde_json::json!({
                        "error": error.to_string()
                    }),
                );
            }
        }
        let protocol_proxy_enabled = relay_protocol_proxy_enabled(&settings);
        if protocol_proxy_enabled {
            protocol_proxy_port = crate::protocol_proxy::DEFAULT_PROTOCOL_PROXY_PORT;
        }
        if protocol_proxy_enabled {
            hooks.start_protocol_proxy(protocol_proxy_port).await?;
        }

        let launch = hooks
            .launch_codex(&app_dir, &settings, &settings.codex_extra_args)
            .await?;
        launched = Some(launch.clone());
        if settings.computer_use_guard_enabled {
            hooks.start_computer_use_guard_watchdog(&settings).await?;
        }

        let status = launch_status(
            "running",
            "ChatGPT++ managed launch ready",
            protocol_proxy_port,
            &app_dir,
        );
        options.status_store.save_latest(&status)?;
        hooks.write_status("running").await;

        Ok(LaunchHandle {
            protocol_proxy_port,
            app_dir: app_dir.clone(),
            launch,
            status_store: status_store.clone(),
            hooks: Arc::clone(&hooks),
        })
    }
    .await;

    match result {
        Ok(handle) => Ok(handle),
        Err(error) => {
            hooks.shutdown_owned_resources(protocol_proxy_port).await;
            if let Some(launch) = &launched {
                hooks.terminate_codex(launch).await;
            }
            let message = error.to_string();
            let failure = launch_status("failed", &message, protocol_proxy_port, &app_dir);
            let _ = status_store.save_latest(&failure);
            hooks.write_status("failed").await;
            Err(error)
        }
    }
}

fn relay_protocol_proxy_enabled(settings: &BackendSettings) -> bool {
    settings.active_relay_uses_protocol_proxy()
}

#[cfg(windows)]
fn apply_chatgptplusplus_window_icon_after_launch(process_id: u32) {
    let icon_resource_path =
        std::env::current_exe().unwrap_or_else(|_| PathBuf::from("chatgpt-plus-plus-manager.exe"));
    tokio::spawn(async move {
        for attempt in 1..=30 {
            if crate::windows_apply_chatgptplusplus_icon_to_process_window(
                process_id,
                icon_resource_path.clone(),
            ) {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if attempt == 30 {
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "launch_runtime.window_icon.apply_failed",
                    serde_json::json!({
                        "process_id": process_id,
                        "icon_resource_path": icon_resource_path.to_string_lossy()
                    }),
                );
            }
        }
    });
}

#[cfg(not(windows))]
fn apply_chatgptplusplus_window_icon_after_launch(_process_id: u32) {}

pub trait IntoLaunchHooks {
    fn into_launch_hooks(self) -> Arc<dyn LaunchHooks>;
}

impl<T> IntoLaunchHooks for &T
where
    T: LaunchHooks + Clone + 'static,
{
    fn into_launch_hooks(self) -> Arc<dyn LaunchHooks> {
        Arc::new(self.clone())
    }
}

impl IntoLaunchHooks for Arc<dyn LaunchHooks> {
    fn into_launch_hooks(self) -> Arc<dyn LaunchHooks> {
        self
    }
}

impl IntoLaunchHooks for DefaultLaunchHooks {
    fn into_launch_hooks(self) -> Arc<dyn LaunchHooks> {
        Arc::new(self)
    }
}

impl DefaultLaunchHooks {
    pub fn shared() -> Arc<dyn LaunchHooks> {
        Arc::new(Self::default())
    }
}

fn protocol_proxy_bind_host() -> String {
    crate::branding::env_var_with_legacy("CHATGPT_PLUS_HELPER_BIND", "CODEX_PLUS_HELPER_BIND")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

#[async_trait]
impl LaunchHooks for DefaultLaunchHooks {
    fn resolve_app_dir(
        &self,
        app_dir: Option<&Path>,
        settings: &BackendSettings,
    ) -> anyhow::Result<PathBuf> {
        crate::app_paths::resolve_codex_app_dir_with_saved(
            app_dir,
            Some(settings.codex_app_path.as_str()),
        )
        .ok_or_else(|| anyhow::anyhow!("Codex App directory not found"))
    }

    fn select_protocol_proxy_port(&self, requested: u16) -> u16 {
        crate::ports::select_platform_loopback_port(requested)
    }

    async fn load_settings(&self) -> anyhow::Result<BackendSettings> {
        SettingsStore::default().load()
    }

    async fn run_provider_sync(&self) -> anyhow::Result<()> {
        anyhow::bail!(
            "provider sync requires manager launch hooks with chatgpt-plus-data integration"
        )
    }

    async fn ensure_computer_use_config(&self, settings: &BackendSettings) -> anyhow::Result<()> {
        if !settings.computer_use_guard_enabled {
            return Ok(());
        }
        let home = crate::codex_home::default_codex_home_dir();
        let artifacts = crate::computer_use_guard::resolve_computer_use_guard_artifacts(&home)?;
        crate::computer_use_guard::ensure_computer_use_config_with_artifacts(&home, &artifacts)?;
        *self.computer_use_guard_artifacts.lock().await = Some(artifacts);
        Ok(())
    }

    async fn ensure_plugin_marketplace_config(
        &self,
        _settings: &BackendSettings,
    ) -> anyhow::Result<()> {
        let home = crate::codex_home::default_codex_home_dir();
        match crate::plugin_marketplace::ensure_openai_curated_marketplace_config(&home) {
            Ok(configured) => {
                if configured {
                    let _ = crate::diagnostic_log::append_diagnostic_log(
                        "launch_runtime.openai_curated_marketplace_configured",
                        serde_json::json!({
                            "home": home,
                        }),
                    );
                }
            }
            Err(error) => {
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "launch_runtime.openai_curated_marketplace_config_failed",
                    serde_json::json!({
                        "home": home,
                        "message": error.to_string(),
                    }),
                );
            }
        }
        match crate::plugin_marketplace::ensure_role_specific_plugins_marketplace_config(&home) {
            Ok(configured) => {
                if configured {
                    let _ = crate::diagnostic_log::append_diagnostic_log(
                        "launch_runtime.role_specific_plugins_marketplace_configured",
                        serde_json::json!({
                            "home": home,
                        }),
                    );
                }
            }
            Err(error) => {
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "launch_runtime.role_specific_plugins_marketplace_config_failed",
                    serde_json::json!({
                        "home": home,
                        "message": error.to_string(),
                    }),
                );
            }
        }
        Ok(())
    }

    async fn start_protocol_proxy(&self, protocol_proxy_port: u16) -> anyhow::Result<()> {
        let bind_host = protocol_proxy_bind_host();
        let listener = tokio::net::TcpListener::bind((bind_host.as_str(), protocol_proxy_port))
            .await
            .with_context(|| {
                format!("failed to bind protocol proxy on {bind_host}:{protocol_proxy_port}")
            })?;
        let _ = crate::diagnostic_log::append_diagnostic_log(
            "protocol_proxy.listening",
            serde_json::json!({
                "protocol_proxy_port": protocol_proxy_port,
                "bind_host": bind_host,
                "address": format!("http://{bind_host}:{protocol_proxy_port}")
            }),
        );
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => break,
                    accepted = listener.accept() => {
                        if let Ok((stream, addr)) = accepted {
                            tokio::spawn(async move {
                                let _ = handle_protocol_proxy_connection(stream, Some(addr)).await;
                            });
                        }
                    }
                }
            }
        });
        *self.protocol_proxy.lock().await = Some(ProtocolProxyRuntime {
            shutdown: shutdown_tx,
            task,
        });
        Ok(())
    }

    async fn launch_codex(
        &self,
        app_dir: &Path,
        settings: &BackendSettings,
        extra_args: &[String],
    ) -> anyhow::Result<CodexLaunch> {
        let launch_extra_args = codex_extra_args_for_launch(settings, extra_args);
        if cfg!(windows) {
            let activation = build_packaged_activation(app_dir, &launch_extra_args);
            if let Some(activation) = activation {
                let CodexLaunch::PackagedActivation {
                    app_user_model_id,
                    arguments,
                    ..
                } = &activation
                else {
                    unreachable!();
                };
                let process_id = activate_packaged_app(app_user_model_id, arguments).await?;
                apply_chatgptplusplus_window_icon_after_launch(process_id);
                return Ok(match activation {
                    CodexLaunch::PackagedActivation {
                        app_user_model_id,
                        arguments,
                        ..
                    } => CodexLaunch::PackagedActivation {
                        app_user_model_id,
                        arguments,
                        process_id: Some(process_id),
                    },
                    CodexLaunch::Process { .. } => unreachable!(),
                });
            }
        }

        if app_dir.extension().and_then(|value| value.to_str()) == Some("app") {
            let cleanup_policy = if is_macos_app_running(app_dir).await {
                MacosCleanupPolicy::SkipQuitBecauseAlreadyRunning
            } else {
                MacosCleanupPolicy::QuitIfNotPreviouslyRunning
            };
            let command = build_macos_open_command(app_dir, &launch_extra_args);
            let executable = command
                .first()
                .ok_or_else(|| anyhow::anyhow!("macOS open command is empty"))?;
            let child = Command::new(executable)
                .args(&command[1..])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .context("failed to launch macOS Codex app")?;
            *self.child.lock().await = Some(child);
            return Ok(CodexLaunch::Process {
                command,
                wait_strategy: ProcessWaitStrategy::ExternalWaitCommand,
                macos_cleanup_policy: Some(cleanup_policy),
            });
        }

        let command = build_codex_command(app_dir, &launch_extra_args);
        let executable = command
            .first()
            .ok_or_else(|| anyhow::anyhow!("Codex command is empty"))?;
        let mut child_command = Command::new(executable);
        child_command
            .args(&command[1..])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        child_command.creation_flags(crate::windows_integration::CREATE_NO_WINDOW);
        let child = child_command
            .spawn()
            .with_context(|| format!("failed to launch Codex executable {executable}"))?;
        *self.child.lock().await = Some(child);
        Ok(CodexLaunch::Process {
            command,
            wait_strategy: ProcessWaitStrategy::TrackedChild,
            macos_cleanup_policy: None,
        })
    }

    async fn start_computer_use_guard_watchdog(
        &self,
        settings: &BackendSettings,
    ) -> anyhow::Result<()> {
        #[cfg(windows)]
        {
            if !settings.computer_use_guard_enabled {
                return Ok(());
            }
            let home = crate::codex_home::default_codex_home_dir();
            let artifacts = self.computer_use_guard_artifacts.lock().await.clone();
            let (shutdown, mut shutdown_rx) = tokio::sync::oneshot::channel();
            let task = tokio::spawn(async move {
                run_post_launch_computer_use_guard(home, artifacts, &mut shutdown_rx).await;
            });
            if let Some(runtime) = self
                .computer_use_guard_watchdog
                .lock()
                .await
                .replace(ComputerUseGuardWatchdogRuntime { shutdown, task })
            {
                let _ = runtime.shutdown.send(());
                let _ = runtime.task.await;
            }
        }
        #[cfg(target_os = "macos")]
        {
            let _ = &settings;
            let (shutdown, mut shutdown_rx) = tokio::sync::oneshot::channel();
            let task = tokio::spawn(async move {
                loop {
                    tokio::select! {
                        _ = &mut shutdown_rx => break,
                        _ = tokio::time::sleep(std::time::Duration::from_secs(120)) => {
                            crate::computer_use_guard::kill_orphaned_computer_use_processes();
                        }
                    }
                }
            });
            if let Some(runtime) = self
                .computer_use_guard_watchdog
                .lock()
                .await
                .replace(ComputerUseGuardWatchdogRuntime { shutdown, task })
            {
                let _ = runtime.shutdown.send(());
                let _ = runtime.task.await;
            }
        }
        Ok(())
    }

    async fn write_status(&self, _status: &str) {}

    async fn wait_for_codex_exit(&self, launch: &CodexLaunch) -> anyhow::Result<()> {
        match launch {
            CodexLaunch::Process { .. } => {
                if let Some(mut child) = self.child.lock().await.take() {
                    let _ = child.wait().await;
                }
            }
            CodexLaunch::PackagedActivation { process_id, .. } => {
                if let Some(process_id) = process_id {
                    wait_for_windows_process_id(*process_id).await?;
                }
            }
        }
        let mut empty_streak = 0u32;
        loop {
            if crate::watcher::find_codex_processes().is_empty() {
                empty_streak = empty_streak.saturating_add(1);
                if empty_streak >= 3 {
                    break;
                }
            } else {
                empty_streak = 0;
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
        Ok(())
    }

    async fn shutdown_owned_resources(&self, _protocol_proxy_port: u16) {
        if let Some(runtime) = self.computer_use_guard_watchdog.lock().await.take() {
            let _ = runtime.shutdown.send(());
            let _ = runtime.task.await;
        }
        if let Some(runtime) = self.protocol_proxy.lock().await.take() {
            let _ = runtime.shutdown.send(());
            let _ = runtime.task.await;
        }
    }

    async fn terminate_codex(&self, launch: &CodexLaunch) {
        match launch {
            CodexLaunch::Process {
                wait_strategy: ProcessWaitStrategy::ExternalWaitCommand,
                command,
                macos_cleanup_policy,
            } => {
                if let Some(mut child) = self.child.lock().await.take() {
                    let _ = child.kill().await;
                }
                if let (Some(app_dir), Some(cleanup_policy)) = (
                    macos_app_dir_from_open_command(command),
                    *macos_cleanup_policy,
                ) {
                    let _ = run_macos_cleanup_command(&app_dir, cleanup_policy).await;
                }
            }
            CodexLaunch::Process { .. } => {
                if let Some(mut child) = self.child.lock().await.take() {
                    let _ = child.kill().await;
                }
            }
            CodexLaunch::PackagedActivation {
                process_id: Some(process_id),
                ..
            } => {
                let _ = terminate_windows_process_id(*process_id).await;
            }
            CodexLaunch::PackagedActivation {
                process_id: None, ..
            } => {}
        }
    }
}

async fn handle_protocol_proxy_connection(
    mut stream: tokio::net::TcpStream,
    remote_addr: Option<SocketAddr>,
) -> anyhow::Result<()> {
    let request_bytes = read_http_request(&mut stream).await?;
    let request = String::from_utf8_lossy(&request_bytes);
    let request_line = request.lines().next().unwrap_or_default();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let raw_path = parts.next().unwrap_or_default();
    let path = raw_path.split('?').next().unwrap_or(raw_path);
    let request_body = http_request_body(&request);
    let request_user_agent = header_value_from_request(&request, "user-agent");
    let remote_addr_text = remote_addr.map(|addr| addr.to_string());

    let _ = crate::diagnostic_log::append_diagnostic_log(
        "protocol_proxy.request",
        serde_json::json!({
            "method": method,
            "path": path,
            "request_line": request_line,
            "remote_addr": remote_addr_text,
            "body_bytes": request_body.len()
        }),
    );

    let proxy_request = crate::protocol_proxy::ProtocolProxyRequest::new(
        method,
        raw_path,
        request_body.as_bytes().to_vec(),
        request_user_agent,
    );
    match crate::protocol_proxy::protocol_proxy_transaction(proxy_request).await {
        Ok(Some(response)) => {
            return write_protocol_proxy_response(
                &mut stream,
                response,
                method,
                path,
                remote_addr_text,
            )
            .await;
        }
        Ok(None) => {}
        Err(error) => {
            let body = serde_json::to_vec(&serde_json::json!({
                "status": "failed",
                "message": error.to_string()
            }))?;
            write_http_response(
                &mut stream,
                "502 Bad Gateway",
                "application/json; charset=utf-8",
                &body,
            )
            .await?;
            log_protocol_proxy_response(
                "protocol_proxy.protocol_proxy_failed",
                method,
                path,
                "502 Bad Gateway",
                remote_addr_text,
            );
            stream.shutdown().await?;
            return Ok(());
        }
    }

    let status = "404 Not Found".to_string();
    let body = serde_json::to_vec(&serde_json::json!({
        "status": "failed",
        "message": "未知协议代理路径"
    }))?;
    let content_type = "application/json; charset=utf-8".to_string();
    let log_event = "protocol_proxy.unknown_path";
    let _ = crate::diagnostic_log::append_diagnostic_log(
        log_event,
        serde_json::json!({
            "method": method,
            "path": path,
            "status": status,
            "remote_addr": remote_addr_text
        }),
    );
    let response = if method == "OPTIONS" {
        format!(
            "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        )
    } else {
        format!(
            "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
    };
    stream.write_all(response.as_bytes()).await?;
    if method != "OPTIONS" {
        stream.write_all(&body).await?;
    }
    stream.shutdown().await?;
    Ok(())
}

async fn write_protocol_proxy_response(
    stream: &mut tokio::net::TcpStream,
    mut response: crate::protocol_proxy::ProtocolProxyResponse,
    method: &str,
    path: &str,
    remote_addr_text: Option<String>,
) -> anyhow::Result<()> {
    let status = response.status().to_string();
    let content_type = response.content_type().to_string();
    if response.is_stream() {
        write_http_stream_headers(stream, &status, &content_type).await?;
        while let Some(chunk) = response.next_chunk().await? {
            stream.write_all(&chunk).await?;
        }
    } else {
        let mut body = Vec::new();
        while let Some(chunk) = response.next_chunk().await? {
            body.extend(chunk);
        }
        write_http_response(stream, &status, &content_type, &body).await?;
    }
    log_protocol_proxy_response(
        if response.is_success() {
            "protocol_proxy.protocol_proxy_ok"
        } else {
            "protocol_proxy.protocol_proxy_upstream_error"
        },
        method,
        path,
        &status,
        remote_addr_text,
    );
    stream.shutdown().await?;
    Ok(())
}

async fn write_http_response(
    stream: &mut tokio::net::TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
) -> anyhow::Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(response.as_bytes()).await?;
    stream.write_all(body).await?;
    Ok(())
}

async fn write_http_stream_headers(
    stream: &mut tokio::net::TcpStream,
    status: &str,
    content_type: &str,
) -> anyhow::Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nCache-Control: no-cache\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(response.as_bytes()).await?;
    Ok(())
}

fn log_protocol_proxy_response(
    event: &str,
    method: &str,
    path: &str,
    status: &str,
    remote_addr_text: Option<String>,
) {
    let _ = crate::diagnostic_log::append_diagnostic_log(
        event,
        serde_json::json!({
            "method": method,
            "path": path,
            "status": status,
            "remote_addr": remote_addr_text
        }),
    );
}

#[cfg(test)]
mod computer_use_tests {
    use super::header_value_from_request;

    #[test]
    fn header_value_from_request_reads_user_agent_case_insensitively() {
        let request = "POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1\r\nUser-Agent: Codex/26.614\r\nContent-Length: 2\r\n\r\n{}";

        assert_eq!(
            header_value_from_request(request, "user-agent").as_deref(),
            Some("Codex/26.614")
        );
    }
}

async fn read_http_request(stream: &mut tokio::net::TcpStream) -> anyhow::Result<Vec<u8>> {
    let mut buffer = Vec::new();
    let mut chunk = vec![0_u8; 4096];
    let mut header_end = None;
    let mut content_length = 0_usize;

    loop {
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if header_end.is_none() {
            header_end = find_header_end(&buffer);
            if let Some(end) = header_end {
                content_length = content_length_from_headers(&buffer[..end]).unwrap_or(0);
            }
        }
        if let Some(end) = header_end {
            if buffer.len() >= end + 4 + content_length {
                break;
            }
        }
        if buffer.len() > 32 * 1024 * 1024 {
            anyhow::bail!("HTTP 请求过大");
        }
    }

    Ok(buffer)
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn content_length_from_headers(headers: &[u8]) -> Option<usize> {
    let text = String::from_utf8_lossy(headers);
    text.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.trim().eq_ignore_ascii_case("content-length") {
            value.trim().parse().ok()
        } else {
            None
        }
    })
}

fn http_request_body(request: &str) -> &str {
    request
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .unwrap_or_default()
}

fn header_value_from_request(request: &str, header_name: &str) -> Option<String> {
    request
        .split_once("\r\n\r\n")
        .map(|(headers, _)| headers)
        .unwrap_or(request)
        .lines()
        .skip(1)
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.trim()
                .eq_ignore_ascii_case(header_name)
                .then(|| value.trim().to_string())
        })
        .filter(|value| !value.is_empty())
}

pub fn build_codex_arguments(extra_args: &[String]) -> Vec<String> {
    normalize_codex_extra_args(extra_args)
}

pub fn build_codex_arguments_for_settings(settings: &BackendSettings) -> Vec<String> {
    build_codex_arguments(&codex_extra_args_for_launch(
        settings,
        &settings.codex_extra_args,
    ))
}

fn codex_extra_args_for_launch(settings: &BackendSettings, extra_args: &[String]) -> Vec<String> {
    let mut args = Vec::new();
    if settings.codex_app_fast_startup && !has_host_resolver_rules(extra_args) {
        args.push(statsig_fast_fail_host_resolver_rule());
    }
    args.extend(normalize_codex_extra_args(extra_args));
    args
}

fn has_host_resolver_rules(args: &[String]) -> bool {
    args.iter()
        .any(|arg| arg.trim().starts_with("--host-resolver-rules"))
}

fn statsig_fast_fail_host_resolver_rule() -> String {
    [
        "--host-resolver-rules=MAP ab.chatgpt.com 127.0.0.1",
        "MAP featureassets.org 127.0.0.1",
        "MAP prodregistryv2.org 127.0.0.1",
        "MAP api.statsigcdn.com 127.0.0.1",
        "MAP statsigapi.net 127.0.0.1",
        "MAP cloudflare-dns.com 127.0.0.1",
    ]
    .join(",")
}

pub fn build_codex_command(app_dir: &Path, extra_args: &[String]) -> Vec<String> {
    let mut command = vec![
        crate::app_paths::build_codex_executable(app_dir)
            .to_string_lossy()
            .to_string(),
    ];
    command.extend(build_codex_arguments(extra_args));
    command
}

pub fn build_packaged_activation(app_dir: &Path, extra_args: &[String]) -> Option<CodexLaunch> {
    Some(CodexLaunch::PackagedActivation {
        app_user_model_id: crate::app_paths::packaged_app_user_model_id(app_dir)?,
        arguments: command_line_arguments(&build_codex_arguments(extra_args)),
        process_id: None,
    })
}

pub fn build_macos_open_command(app_dir: &Path, extra_args: &[String]) -> Vec<String> {
    let mut command = vec![
        "open".to_string(),
        "-W".to_string(),
        "-a".to_string(),
        app_dir.to_string_lossy().to_string(),
        "--args".to_string(),
    ];
    command.extend(build_codex_arguments(extra_args));
    command
}

pub fn build_macos_cleanup_command(
    app_dir: &Path,
    policy: MacosCleanupPolicy,
) -> Option<Vec<String>> {
    if policy == MacosCleanupPolicy::SkipQuitBecauseAlreadyRunning {
        return None;
    }
    let app_name = app_dir
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Codex");
    Some(vec![
        "osascript".to_string(),
        "-e".to_string(),
        format!(
            r#"tell application "{}" to quit"#,
            app_name.replace('"', "\\\"")
        ),
    ])
}

async fn run_macos_cleanup_command(
    app_dir: &Path,
    policy: MacosCleanupPolicy,
) -> anyhow::Result<()> {
    let Some(command) = build_macos_cleanup_command(app_dir, policy) else {
        return Ok(());
    };
    let Some(executable) = command.first() else {
        return Ok(());
    };
    let _ = Command::new(executable)
        .args(&command[1..])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .with_context(|| format!("failed to request macOS app quit for {}", app_dir.display()))?;
    Ok(())
}

fn macos_app_dir_from_open_command(command: &[String]) -> Option<PathBuf> {
    let app_index = command.iter().position(|part| part == "-a")?;
    command.get(app_index + 1).map(PathBuf::from)
}

async fn is_macos_app_running(app_dir: &Path) -> bool {
    if !cfg!(target_os = "macos") {
        return false;
    }
    let app_name = app_dir
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Codex");
    let script = format!(
        r#"application "{}" is running"#,
        app_name.replace('"', "\\\"")
    );
    let Ok(output) = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await
    else {
        return false;
    };
    output.status.success()
        && String::from_utf8_lossy(&output.stdout)
            .trim()
            .eq_ignore_ascii_case("true")
}

#[cfg_attr(not(windows), allow(dead_code))]
fn post_launch_guard_artifacts_ready(
    artifacts: &crate::computer_use_guard::GuardArtifacts,
) -> bool {
    artifacts.notify_exe.is_some()
        && artifacts.marketplace_path.is_some()
        && (!artifacts.runtime_exports_needed || artifacts.sky_package_json.is_some())
}

#[cfg_attr(not(windows), allow(dead_code))]
fn should_stop_post_launch_computer_use_guard(
    stable_unchanged_attempts: usize,
    artifacts: &crate::computer_use_guard::GuardArtifacts,
) -> bool {
    stable_unchanged_attempts >= POST_LAUNCH_COMPUTER_USE_GUARD_STABLE_ATTEMPTS
        && post_launch_guard_artifacts_ready(artifacts)
}

#[cfg(windows)]
async fn run_post_launch_computer_use_guard(
    home: PathBuf,
    mut artifacts: Option<crate::computer_use_guard::GuardArtifacts>,
    shutdown_rx: &mut tokio::sync::oneshot::Receiver<()>,
) {
    let mut previous_delay = 0_u64;
    let mut stable_unchanged_attempts = 0_usize;
    for (index, delay) in POST_LAUNCH_COMPUTER_USE_GUARD_SECONDS
        .iter()
        .copied()
        .enumerate()
    {
        let wait_seconds = delay.saturating_sub(previous_delay);
        previous_delay = delay;
        if wait_seconds > 0 {
            tokio::select! {
                _ = &mut *shutdown_rx => return,
                _ = tokio::time::sleep(std::time::Duration::from_secs(wait_seconds)) => {}
            }
        }
        let attempt = index + 1;
        let resolved_artifacts = match artifacts.take() {
            Some(artifacts) => artifacts,
            None => match crate::computer_use_guard::resolve_computer_use_guard_artifacts(&home) {
                Ok(resolved) => resolved,
                Err(error) => {
                    stable_unchanged_attempts = 0;
                    let _ = crate::diagnostic_log::append_diagnostic_log(
                        "computer_use_guard.post_launch_failed",
                        serde_json::json!({
                            "attempt": attempt,
                            "delay_seconds": delay,
                            "phase": "resolve_artifacts",
                            "message": error.to_string()
                        }),
                    );
                    continue;
                }
            },
        };
        let artifacts_ready = post_launch_guard_artifacts_ready(&resolved_artifacts);
        artifacts = artifacts_ready.then_some(resolved_artifacts.clone());
        match crate::computer_use_guard::ensure_computer_use_config_with_artifacts(
            &home,
            &resolved_artifacts,
        ) {
            Ok(result) => {
                if !result.changed && artifacts_ready {
                    stable_unchanged_attempts += 1;
                } else {
                    stable_unchanged_attempts = 0;
                }
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "computer_use_guard.post_launch_ok",
                    serde_json::json!({
                        "attempt": attempt,
                        "delay_seconds": delay,
                        "changed": result.changed,
                        "stable_unchanged_attempts": stable_unchanged_attempts,
                        "notify_exe": result
                            .notify_exe
                            .map(|path| path.to_string_lossy().to_string())
                    }),
                );
                if should_stop_post_launch_computer_use_guard(
                    stable_unchanged_attempts,
                    &resolved_artifacts,
                ) {
                    let _ = crate::diagnostic_log::append_diagnostic_log(
                        "computer_use_guard.post_launch_stable_stop",
                        serde_json::json!({
                            "attempt": attempt,
                            "delay_seconds": delay,
                            "stable_unchanged_attempts": stable_unchanged_attempts
                        }),
                    );
                    return;
                }
            }
            Err(error) => {
                stable_unchanged_attempts = 0;
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "computer_use_guard.post_launch_failed",
                    serde_json::json!({
                        "attempt": attempt,
                        "delay_seconds": delay,
                        "message": error.to_string()
                    }),
                );
            }
        }
    }
}

#[cfg(windows)]
async fn wait_for_windows_process_id(process_id: u32) -> anyhow::Result<()> {
    tokio::task::spawn_blocking(move || wait_for_windows_process_id_blocking(process_id))
        .await
        .context("Windows process wait task failed")?
}

#[cfg(windows)]
async fn terminate_windows_process_id(process_id: u32) -> anyhow::Result<()> {
    tokio::task::spawn_blocking(move || terminate_windows_process_id_blocking(process_id))
        .await
        .context("Windows process termination task failed")?
}

#[cfg(windows)]
fn wait_for_windows_process_id_blocking(process_id: u32) -> anyhow::Result<()> {
    use windows::Win32::Foundation::{CloseHandle, WAIT_FAILED};
    use windows::Win32::System::Threading::{
        INFINITE, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
        WaitForSingleObject,
    };

    unsafe {
        let handle = OpenProcess(
            PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
            false,
            process_id,
        )
        .with_context(|| format!("failed to open Windows process id {process_id}"))?;
        let wait_result = WaitForSingleObject(handle, INFINITE);
        let _ = CloseHandle(handle);
        if wait_result == WAIT_FAILED {
            anyhow::bail!("failed to wait for Windows process id {process_id}");
        }
    }
    Ok(())
}

#[cfg(windows)]
fn terminate_windows_process_id_blocking(process_id: u32) -> anyhow::Result<()> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE, TerminateProcess,
    };

    unsafe {
        let handle = OpenProcess(
            PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION,
            false,
            process_id,
        )
        .with_context(|| format!("failed to open Windows process id {process_id}"))?;
        let terminate_result = TerminateProcess(handle, 1);
        let _ = CloseHandle(handle);
        terminate_result
            .with_context(|| format!("failed to terminate Windows process id {process_id}"))?;
    }
    Ok(())
}

#[cfg(not(windows))]
async fn wait_for_windows_process_id(process_id: u32) -> anyhow::Result<()> {
    anyhow::bail!("cannot wait for Windows process id {process_id} on this platform")
}

#[cfg(not(windows))]
async fn terminate_windows_process_id(process_id: u32) -> anyhow::Result<()> {
    anyhow::bail!("cannot terminate Windows process id {process_id} on this platform")
}

fn launch_status(
    status: &str,
    message: &str,
    protocol_proxy_port: u16,
    app_dir: &Path,
) -> LaunchStatus {
    LaunchStatus {
        status: status.to_string(),
        message: message.to_string(),
        started_at_ms: now_ms(),
        protocol_proxy_port: Some(protocol_proxy_port),
        codex_app: Some(app_dir.to_string_lossy().to_string()),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn command_line_arguments(args: &[String]) -> String {
    args.iter()
        .map(|arg| quote_windows_argument(arg))
        .collect::<Vec<_>>()
        .join(" ")
}

fn quote_windows_argument(arg: &str) -> String {
    if !arg.is_empty() && !arg.bytes().any(|byte| matches!(byte, b' ' | b'\t' | b'"')) {
        return arg.to_string();
    }
    let mut output = String::from("\"");
    let mut backslashes = 0;
    for ch in arg.chars() {
        match ch {
            '\\' => backslashes += 1,
            '"' => {
                output.push_str(&"\\".repeat(backslashes * 2 + 1));
                output.push('"');
                backslashes = 0;
            }
            _ => {
                output.push_str(&"\\".repeat(backslashes));
                output.push(ch);
                backslashes = 0;
            }
        }
    }
    output.push_str(&"\\".repeat(backslashes * 2));
    output.push('"');
    output
}

#[cfg(not(windows))]
pub async fn activate_packaged_app(
    _app_user_model_id: &str,
    _arguments: &str,
) -> anyhow::Result<u32> {
    anyhow::bail!("Packaged app activation is only supported on Windows")
}

#[cfg(windows)]
pub async fn activate_packaged_app(
    app_user_model_id: &str,
    arguments: &str,
) -> anyhow::Result<u32> {
    let app_user_model_id = app_user_model_id.to_string();
    let arguments = arguments.to_string();
    tokio::task::spawn_blocking(move || {
        activate_packaged_app_blocking(&app_user_model_id, &arguments)
    })
    .await
    .context("packaged app activation task failed")?
}

#[cfg(windows)]
fn activate_packaged_app_blocking(app_user_model_id: &str, arguments: &str) -> anyhow::Result<u32> {
    use windows::Win32::System::Com::{
        CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
        CoUninitialize,
    };
    use windows::Win32::UI::Shell::{ApplicationActivationManager, IApplicationActivationManager};
    use windows::core::HSTRING;

    unsafe {
        let coinit = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let should_uninitialize = coinit.is_ok();
        coinit.ok().or_else(|error| {
            const RPC_E_CHANGED_MODE: i32 = -2147417850;
            if error.code().0 == RPC_E_CHANGED_MODE {
                Ok(())
            } else {
                Err(error)
            }
        })?;

        let result: windows::core::Result<u32> = (|| {
            let manager: IApplicationActivationManager =
                CoCreateInstance(&ApplicationActivationManager, None, CLSCTX_LOCAL_SERVER)?;
            let process_id = manager.ActivateApplication(
                &HSTRING::from(app_user_model_id),
                &HSTRING::from(arguments),
                windows::Win32::UI::Shell::ACTIVATEOPTIONS(0),
            )?;
            Ok(process_id)
        })();

        if should_uninitialize {
            CoUninitialize();
        }
        result.map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn post_launch_guard_stops_after_stable_ready_artifacts() {
        let artifacts = crate::computer_use_guard::GuardArtifacts {
            notify_exe: Some(PathBuf::from("codex-computer-use.exe")),
            marketplace_path: Some(PathBuf::from("openai-bundled")),
            sky_package_json: None,
            runtime_exports_needed: false,
        };

        assert!(!should_stop_post_launch_computer_use_guard(2, &artifacts));
        assert!(should_stop_post_launch_computer_use_guard(3, &artifacts));
    }

    #[test]
    fn post_launch_guard_keeps_retrying_until_artifacts_are_ready() {
        let missing_notify = crate::computer_use_guard::GuardArtifacts {
            notify_exe: None,
            marketplace_path: Some(PathBuf::from("openai-bundled")),
            sky_package_json: None,
            runtime_exports_needed: false,
        };
        let missing_marketplace = crate::computer_use_guard::GuardArtifacts {
            notify_exe: Some(PathBuf::from("codex-computer-use.exe")),
            marketplace_path: None,
            sky_package_json: None,
            runtime_exports_needed: false,
        };
        let missing_runtime_package = crate::computer_use_guard::GuardArtifacts {
            notify_exe: Some(PathBuf::from("codex-computer-use.exe")),
            marketplace_path: Some(PathBuf::from("openai-bundled")),
            sky_package_json: None,
            runtime_exports_needed: true,
        };

        assert!(!should_stop_post_launch_computer_use_guard(
            3,
            &missing_notify
        ));
        assert!(!should_stop_post_launch_computer_use_guard(
            3,
            &missing_marketplace
        ));
        assert!(!should_stop_post_launch_computer_use_guard(
            3,
            &missing_runtime_package
        ));
    }
}
