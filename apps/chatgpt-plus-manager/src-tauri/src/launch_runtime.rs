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
    handle: LaunchHandle,
}

impl ManagedLaunchRuntime {
    pub async fn start(
        &self,
        action: LaunchAction,
        request: LaunchRequest,
    ) -> anyhow::Result<LaunchOutcome> {
        let _operation = self.operation.lock().await;
        let active_protocol_proxy_port = self
            .state
            .lock()
            .await
            .active
            .as_ref()
            .map(|active| active.handle.protocol_proxy_port);
        let system_chatgpt_running = action == LaunchAction::Launch
            && active_protocol_proxy_port.is_none()
            && !chatgpt_plus_core::codex_processes::find_codex_processes().is_empty();
        if should_report_already_running(
            action,
            active_protocol_proxy_port.is_some(),
            system_chatgpt_running,
        ) {
            return Ok(LaunchOutcome {
                protocol_proxy_port: active_protocol_proxy_port
                    .unwrap_or(request.protocol_proxy_port),
                already_running: true,
            });
        }

        let previous = self.state.lock().await.active.take();
        if let Some(previous) = previous {
            previous.handle.shutdown_owned_resources().await;
        }
        if should_stop_existing_codex_processes(action) {
            chatgpt_plus_core::codex_processes::stop_codex_processes_and_wait();
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
                handle: handle.clone(),
            });
            generation
        };
        self.watch_launch(generation, handle);
        Ok(outcome)
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

fn should_report_already_running(
    action: LaunchAction,
    has_active_launch: bool,
    system_chatgpt_running: bool,
) -> bool {
    action == LaunchAction::Launch && (has_active_launch || system_chatgpt_running)
}

fn should_stop_existing_codex_processes(action: LaunchAction) -> bool {
    action == LaunchAction::Restart
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

#[cfg(test)]
mod tests {
    use super::{
        LaunchAction, should_report_already_running, should_stop_existing_codex_processes,
    };

    #[test]
    fn launch_reports_managed_or_system_chatgpt_as_already_running() {
        assert!(should_report_already_running(
            LaunchAction::Launch,
            true,
            false,
        ));
        assert!(should_report_already_running(
            LaunchAction::Launch,
            false,
            true,
        ));
        assert!(!should_report_already_running(
            LaunchAction::Launch,
            false,
            false,
        ));
        assert!(!should_report_already_running(
            LaunchAction::Restart,
            true,
            true,
        ));
    }

    #[test]
    fn only_explicit_restart_stops_existing_chatgpt_before_launch() {
        assert!(!should_stop_existing_codex_processes(LaunchAction::Launch));
        assert!(should_stop_existing_codex_processes(LaunchAction::Restart));
    }
}
