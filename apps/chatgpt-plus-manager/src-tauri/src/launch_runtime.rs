use std::path::{Path, PathBuf};
use std::sync::Arc;

use chatgpt_plus_core::launcher::{
    CodexLaunch, DefaultLaunchHooks, LaunchHandle, LaunchHooks, LaunchOptions,
    launch_codex_with_hooks,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchAction {
    Launch,
    Restart,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchRequest {
    pub app_path: Option<PathBuf>,
    pub protocol_proxy_port: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LaunchOutcome {
    pub protocol_proxy_port: u16,
    pub already_running: bool,
}

#[derive(Clone, Default)]
pub struct ManagedLaunchRuntime {
    operation: Arc<tokio::sync::Mutex<()>>,
    state: Arc<tokio::sync::Mutex<LaunchState>>,
}

#[derive(Default)]
struct LaunchState {
    generation: u64,
    active: Option<ActiveLaunch>,
}

struct ActiveLaunch {
    generation: u64,
    request: LaunchRequest,
    handle: LaunchHandle,
}

impl ManagedLaunchRuntime {
    pub async fn start(
        &self,
        action: LaunchAction,
        request: LaunchRequest,
    ) -> anyhow::Result<LaunchOutcome> {
        let _operation = self.operation.lock().await;
        if action == LaunchAction::Launch {
            let state = self.state.lock().await;
            if let Some(active) = &state.active {
                return Ok(LaunchOutcome {
                    protocol_proxy_port: active.handle.protocol_proxy_port,
                    already_running: true,
                });
            }
        }

        let previous = self.state.lock().await.active.take();
        if let Some(previous) = previous {
            previous.handle.shutdown_owned_resources().await;
        }
        if action == LaunchAction::Restart {
            chatgpt_plus_core::watcher::stop_codex_processes_and_wait();
        }

        let hooks = ManagerLaunchHooks::default();
        let handle = launch_codex_with_hooks(
            LaunchOptions {
                app_dir: request.app_path.clone(),
                protocol_proxy_port: request.protocol_proxy_port,
                ..LaunchOptions::default()
            },
            &hooks,
        )
        .await?;
        let outcome = LaunchOutcome {
            protocol_proxy_port: handle.protocol_proxy_port,
            already_running: false,
        };
        let generation = {
            let mut state = self.state.lock().await;
            state.generation = state.generation.wrapping_add(1);
            let generation = state.generation;
            state.active = Some(ActiveLaunch {
                generation,
                request,
                handle: handle.clone(),
            });
            generation
        };
        self.watch_launch(generation, handle);
        Ok(outcome)
    }

    pub fn restart_after_configuration_change(&self) {
        let runtime = self.clone();
        tauri::async_runtime::spawn(async move {
            let request = runtime
                .state
                .lock()
                .await
                .active
                .as_ref()
                .map(|active| active.request.clone());
            let Some(request) = request else {
                return;
            };
            if let Err(error) = runtime.start(LaunchAction::Restart, request).await {
                let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
                    "manager.launch_runtime.config_restart_failed",
                    serde_json::json!({ "error": error.to_string() }),
                );
            }
        });
    }

    pub async fn shutdown_owned_resources(&self) {
        let _operation = self.operation.lock().await;
        let active = self.state.lock().await.active.take();
        if let Some(active) = active {
            active.handle.shutdown_owned_resources().await;
        }
    }

    fn watch_launch(&self, generation: u64, handle: LaunchHandle) {
        let state = Arc::clone(&self.state);
        tauri::async_runtime::spawn(async move {
            let result = handle.wait_for_codex_exit().await;
            handle.shutdown_owned_resources().await;
            let mut state = state.lock().await;
            if state
                .active
                .as_ref()
                .is_some_and(|active| active.generation == generation)
            {
                state.active = None;
            }
            if let Err(error) = result {
                let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
                    "manager.launch_runtime.wait_failed",
                    serde_json::json!({ "error": error.to_string() }),
                );
            }
        });
    }
}

#[derive(Clone)]
struct ManagerLaunchHooks {
    core: Arc<DefaultLaunchHooks>,
}

impl Default for ManagerLaunchHooks {
    fn default() -> Self {
        Self {
            core: Arc::new(DefaultLaunchHooks::default()),
        }
    }
}

#[async_trait::async_trait]
impl LaunchHooks for ManagerLaunchHooks {
    fn resolve_app_dir(
        &self,
        app_dir: Option<&Path>,
        settings: &chatgpt_plus_core::settings::BackendSettings,
    ) -> anyhow::Result<PathBuf> {
        self.core.resolve_app_dir(app_dir, settings)
    }

    fn select_protocol_proxy_port(&self, requested: u16) -> u16 {
        self.core.select_protocol_proxy_port(requested)
    }

    async fn load_settings(&self) -> anyhow::Result<chatgpt_plus_core::settings::BackendSettings> {
        self.core.load_settings().await
    }

    async fn refresh_model_catalog(
        &self,
        settings: &mut chatgpt_plus_core::settings::BackendSettings,
    ) -> anyhow::Result<()> {
        self.core.refresh_model_catalog(settings).await
    }

    fn apply_codex_home(
        &self,
        settings: &chatgpt_plus_core::settings::BackendSettings,
    ) -> anyhow::Result<()> {
        self.core.apply_codex_home(settings)
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

    async fn start_protocol_proxy(&self, protocol_proxy_port: u16) -> anyhow::Result<()> {
        self.core.start_protocol_proxy(protocol_proxy_port).await
    }

    async fn launch_codex(
        &self,
        app_dir: &Path,
        settings: &chatgpt_plus_core::settings::BackendSettings,
        extra_args: &[String],
    ) -> anyhow::Result<CodexLaunch> {
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

    async fn wait_for_codex_exit(&self, launch: &CodexLaunch) -> anyhow::Result<()> {
        self.core.wait_for_codex_exit(launch).await
    }

    async fn shutdown_owned_resources(&self, protocol_proxy_port: u16) {
        self.core
            .shutdown_owned_resources(protocol_proxy_port)
            .await;
    }

    async fn terminate_codex(&self, launch: &CodexLaunch) {
        self.core.terminate_codex(launch).await;
    }
}
