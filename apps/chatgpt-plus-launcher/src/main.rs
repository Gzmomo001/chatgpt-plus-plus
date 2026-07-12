#![cfg_attr(windows, windows_subsystem = "windows")]

use anyhow::{Context, Result};
use chatgpt_plus_core::launcher::{
    DefaultLaunchHooks, LaunchHooks, LaunchOptions, launch_codex_with_hooks,
};
use serde_json::json;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Clone)]
struct LauncherHooks {
    core: Arc<DefaultLaunchHooks>,
}

impl Default for LauncherHooks {
    fn default() -> Self {
        Self {
            core: Arc::new(DefaultLaunchHooks::default()),
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let helper_only = args.iter().any(|arg| arg == "--helper-only");
    let options = parse_launch_options(args.iter());
    if helper_only {
        let hooks = LauncherHooks::default();
        hooks.start_helper(options.helper_port).await?;
        std::future::pending::<()>().await;
        hooks.shutdown_helper(options.helper_port).await;
        return Ok(());
    }
    let Some(_guard) = acquire_single_instance_guard()? else {
        activate_existing_codex_app(&options).await?;
        return Ok(());
    };
    tokio::spawn(async {
        let _ = notify_manager_when_update_available().await;
    });
    let hooks = LauncherHooks::default();
    let handle = launch_codex_with_hooks(options, &hooks).await?;
    tokio::select! {
        result = handle.wait_for_codex_exit() => result?,
        _ = chatgpt_plus_core::enhanced_launch::wait_for_enhanced_shutdown_request() => {
            handle.shutdown_owned_resources().await;
        }
    }
    Ok(())
}

fn acquire_single_instance_guard()
-> anyhow::Result<Option<chatgpt_plus_core::ports::LoopbackPortGuard>> {
    acquire_single_instance_guard_with_retry(true)
}

fn acquire_single_instance_guard_with_retry(
    allow_stale_recovery: bool,
) -> anyhow::Result<Option<chatgpt_plus_core::ports::LoopbackPortGuard>> {
    match try_acquire_single_instance_guard() {
        Ok(guard) => {
            if let Some(fallback_lock_path) = guard.fallback_path() {
                log_launcher_guard_fallback(fallback_lock_path);
            }
            Ok(Some(guard))
        }
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
            log_launcher_already_running();
            Ok(None)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {
            log_launcher_already_running();
            if allow_stale_recovery && should_recover_stale_launcher() {
                chatgpt_plus_core::watcher::stop_launcher_processes();
                std::thread::sleep(std::time::Duration::from_millis(250));
                return acquire_single_instance_guard_with_retry(false);
            }
            Ok(None)
        }
        Err(error) => Err(error)
            .with_context(|| {
                format!(
                    "failed to acquire launcher guard port {}",
                    chatgpt_plus_core::ports::launcher_guard_port()
                )
            })
            .map(Some),
    }
}

fn try_acquire_single_instance_guard()
-> std::io::Result<chatgpt_plus_core::ports::LoopbackPortGuard> {
    chatgpt_plus_core::ports::acquire_resilient_loopback_port_guard(
        chatgpt_plus_core::ports::launcher_guard_port(),
    )
}

fn log_launcher_guard_fallback(fallback_lock_path: &Path) {
    let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
        "launcher.guard_fallback",
        json!({
            "requested_guard_port": chatgpt_plus_core::ports::launcher_guard_port(),
            "fallback_lock_path": fallback_lock_path
        }),
    );
}

fn should_recover_stale_launcher() -> bool {
    let has_codex_process = !chatgpt_plus_core::watcher::find_codex_processes().is_empty();
    let recover = !has_codex_process;
    let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
        "launcher.stale_recovery_check",
        json!({
            "has_codex_process": has_codex_process,
            "recover": recover
        }),
    );
    recover
}

async fn activate_existing_codex_app(options: &LaunchOptions) -> anyhow::Result<()> {
    let hooks = LauncherHooks::default();
    let settings = hooks.load_settings().await?;
    let app_dir = hooks.resolve_app_dir(options.app_dir.as_deref(), &settings)?;
    let launch_result = hooks
        .launch_codex(&app_dir, &settings, &settings.codex_extra_args)
        .await;
    let process_ids = chatgpt_plus_core::watcher::find_codex_processes();
    #[cfg(windows)]
    let activated = process_ids
        .iter()
        .any(|process_id| chatgpt_plus_core::windows_activate_process_window(*process_id));
    #[cfg(not(windows))]
    let activated = false;
    let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
        "launcher.activate_existing_codex",
        json!({
            "app_dir": app_dir.to_string_lossy(),
            "helper_port": options.helper_port,
            "process_ids": process_ids,
            "activated": activated,
            "launch_ok": launch_result.is_ok(),
            "launch_error": launch_result.as_ref().err().map(|error| error.to_string())
        }),
    );
    launch_result.map(|_| ())
}

fn log_launcher_already_running() {
    let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
        "launcher.already_running",
        json!({
            "guard_port": chatgpt_plus_core::ports::launcher_guard_port()
        }),
    );
}

async fn notify_manager_when_update_available() -> anyhow::Result<bool> {
    let update =
        chatgpt_plus_core::update::check_for_update(chatgpt_plus_core::version::VERSION).await?;
    if !update.update_available {
        return Ok(false);
    }
    open_manager_with_update_prompt()?;
    Ok(true)
}

fn open_manager_with_update_prompt() -> anyhow::Result<()> {
    let manager_path = manager_exe_path();
    let mut command = std::process::Command::new(&manager_path);
    command.arg("--show-update");
    #[cfg(windows)]
    {
        command.creation_flags(chatgpt_plus_core::windows_create_no_window());
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| anyhow::anyhow!("打开 ChatGPT++ 主界面失败：{error}"))
}

fn parse_launch_options<I, S>(args: I) -> LaunchOptions
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut options = LaunchOptions::default();
    let mut iter = args.into_iter();
    while let Some(arg) = iter.next() {
        match arg.as_ref() {
            "--app-path" => {
                if let Some(value) = iter.next() {
                    let value = value.as_ref().trim();
                    if !value.is_empty() {
                        options.app_dir = Some(PathBuf::from(value));
                    }
                }
            }
            "--helper-port" => {
                if let Some(value) = iter.next()
                    && let Ok(port) = value.as_ref().parse::<u16>()
                {
                    options.helper_port = port;
                }
            }
            _ => {}
        }
    }
    options
}

#[async_trait::async_trait(?Send)]
impl LaunchHooks for LauncherHooks {
    fn resolve_app_dir(
        &self,
        app_dir: Option<&Path>,
        settings: &chatgpt_plus_core::settings::BackendSettings,
    ) -> anyhow::Result<PathBuf> {
        self.core.resolve_app_dir(app_dir, settings)
    }

    fn select_helper_port(&self, requested: u16) -> u16 {
        self.core.select_helper_port(requested)
    }

    async fn load_settings(&self) -> anyhow::Result<chatgpt_plus_core::settings::BackendSettings> {
        self.core.load_settings().await
    }

    async fn run_provider_sync(&self) -> anyhow::Result<()> {
        let _ = tokio::task::spawn_blocking(|| chatgpt_plus_data::run_provider_sync(None))
            .await
            .map_err(|error| anyhow::anyhow!("provider sync task failed: {error}"))?;
        Ok(())
    }

    async fn ensure_computer_use_config(
        &self,
        settings: &chatgpt_plus_core::settings::BackendSettings,
    ) -> anyhow::Result<()> {
        self.core.ensure_computer_use_config(settings).await
    }

    async fn ensure_plugin_marketplace_config(
        &self,
        settings: &chatgpt_plus_core::settings::BackendSettings,
    ) -> anyhow::Result<()> {
        self.core.ensure_plugin_marketplace_config(settings).await
    }

    async fn start_helper(&self, helper_port: u16) -> anyhow::Result<()> {
        self.core.start_helper(helper_port).await
    }

    async fn launch_codex(
        &self,
        app_dir: &Path,
        settings: &chatgpt_plus_core::settings::BackendSettings,
        extra_args: &[String],
    ) -> anyhow::Result<chatgpt_plus_core::launcher::CodexLaunch> {
        self.core.launch_codex(app_dir, settings, extra_args).await
    }

    async fn start_computer_use_guard_watchdog(
        &self,
        settings: &chatgpt_plus_core::settings::BackendSettings,
    ) -> anyhow::Result<()> {
        self.core.start_computer_use_guard_watchdog(settings).await
    }

    async fn write_status(&self, status: &str) {
        self.core.write_status(status).await;
    }

    async fn wait_for_codex_exit(
        &self,
        launch: &chatgpt_plus_core::launcher::CodexLaunch,
    ) -> anyhow::Result<()> {
        self.core.wait_for_codex_exit(launch).await
    }

    async fn shutdown_helper(&self, helper_port: u16) {
        self.core.shutdown_helper(helper_port).await;
    }

    async fn terminate_codex(&self, launch: &chatgpt_plus_core::launcher::CodexLaunch) {
        self.core.terminate_codex(launch).await;
    }
}

fn manager_exe_path() -> PathBuf {
    chatgpt_plus_core::install::companion_binary_path(chatgpt_plus_core::install::MANAGER_BINARY)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_launch_options_accepts_manager_forwarded_helper_port_and_app_path() {
        let options =
            parse_launch_options(["--app-path", "C:/Codex/App", "--helper-port", "57322"]);

        assert_eq!(options.app_dir, Some(PathBuf::from("C:/Codex/App")));
        assert_eq!(options.helper_port, 57322);
    }

    #[test]
    fn parse_launch_options_ignores_removed_debug_port_and_invalid_helper_port() {
        let options = parse_launch_options(["--debug-port", "9333", "--helper-port", "70000"]);

        assert_eq!(options.helper_port, LaunchOptions::default().helper_port);
    }

    #[test]
    fn launcher_uses_single_instance_guard_without_renderer_injection() {
        let source = include_str!("main.rs");

        assert!(source.contains("acquire_single_instance_guard()?"));
        assert!(source.contains("activate_existing_codex_app(&options).await?"));
        assert!(!source.contains(concat!("ensure_", "injection")));
        assert!(!source.contains(concat!("start_bridge_", "watchdog")));
        assert!(!source.contains(concat!("Bridge", "Context")));
    }

    #[test]
    fn manager_update_prompt_uses_sidecar_manager_binary_name() {
        let source = include_str!("main.rs");

        assert!(source.contains("install::MANAGER_BINARY"));
        assert!(source.contains("--show-update"));
    }
}
