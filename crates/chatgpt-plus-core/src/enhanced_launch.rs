use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnhancedLaunchAction {
    Launch,
    Restart,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnhancedLaunchRequest {
    pub app_path: Option<PathBuf>,
    pub debug_port: u16,
    pub helper_port: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct HelperLaunchPlan {
    executable: PathBuf,
    arguments: Vec<String>,
}

trait EnhancedLaunchRuntime {
    fn current_exe(&self) -> anyhow::Result<PathBuf>;
    fn path_exists(&self, path: &Path) -> bool;
    fn stop_launcher_processes(&self);
    fn stop_codex_processes(&self);
    fn spawn_hidden(&self, plan: &HelperLaunchPlan) -> anyhow::Result<()>;
}

struct SystemEnhancedLaunchRuntime;

impl EnhancedLaunchRuntime for SystemEnhancedLaunchRuntime {
    fn current_exe(&self) -> anyhow::Result<PathBuf> {
        std::env::current_exe().map_err(Into::into)
    }

    fn path_exists(&self, path: &Path) -> bool {
        path.is_file()
    }

    fn stop_launcher_processes(&self) {
        crate::watcher::stop_launcher_processes_and_wait();
    }

    fn stop_codex_processes(&self) {
        crate::watcher::stop_codex_processes_and_wait();
    }

    fn spawn_hidden(&self, plan: &HelperLaunchPlan) -> anyhow::Result<()> {
        let mut command = std::process::Command::new(&plan.executable);
        command.args(&plan.arguments);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(crate::windows_create_no_window());
        }
        command.spawn().map(|_| ()).map_err(Into::into)
    }
}

pub fn start_enhanced_codex(
    action: EnhancedLaunchAction,
    request: EnhancedLaunchRequest,
) -> anyhow::Result<()> {
    let _ = clear_enhanced_shutdown_request();
    start_enhanced_codex_with(&SystemEnhancedLaunchRuntime, action, request)
}

pub fn request_enhanced_shutdown() -> anyhow::Result<()> {
    request_shutdown_at(&shutdown_request_path())
}

fn clear_enhanced_shutdown_request() -> anyhow::Result<bool> {
    consume_shutdown_at(&shutdown_request_path())
}

pub async fn wait_for_enhanced_shutdown_request() {
    let path = shutdown_request_path();
    loop {
        match consume_shutdown_at(&path) {
            Ok(true) => return,
            Ok(false) => {}
            Err(error) => {
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "launcher.shutdown_signal_failed",
                    serde_json::json!({ "error": error.to_string() }),
                );
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

fn shutdown_request_path() -> PathBuf {
    crate::paths::default_app_state_dir().join("launcher.shutdown")
}

fn request_shutdown_at(path: &Path) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, b"shutdown")?;
    Ok(())
}

fn consume_shutdown_at(path: &Path) -> anyhow::Result<bool> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn start_enhanced_codex_with<R: EnhancedLaunchRuntime>(
    runtime: &R,
    action: EnhancedLaunchAction,
    request: EnhancedLaunchRequest,
) -> anyhow::Result<()> {
    let current_exe = runtime.current_exe()?;
    let helper =
        crate::install::companion_binary_path_from_exe(&current_exe, crate::install::SILENT_BINARY);
    if !runtime.path_exists(&helper) {
        anyhow::bail!(
            "ChatGPT++ 内部启动 helper 缺失：{}。请重新安装或修复 ChatGPT++。",
            helper.to_string_lossy()
        );
    }

    let plan = HelperLaunchPlan {
        executable: helper,
        arguments: helper_arguments(&request),
    };
    if action == EnhancedLaunchAction::Restart {
        runtime.stop_launcher_processes();
        runtime.stop_codex_processes();
    }
    runtime.spawn_hidden(&plan).map_err(|error| {
        anyhow::anyhow!(
            "无法启动 ChatGPT++ 内部 helper {}：{error}",
            plan.executable.to_string_lossy()
        )
    })?;
    let _ = crate::diagnostic_log::append_diagnostic_log(
        "app.enhanced_launch_requested",
        serde_json::json!({
            "action": if action == EnhancedLaunchAction::Restart { "restart" } else { "launch" },
            "debug_port": request.debug_port,
            "helper_port": request.helper_port,
            "app_path": request.app_path.as_ref().map(|path| path.to_string_lossy())
        }),
    );
    Ok(())
}

fn helper_arguments(request: &EnhancedLaunchRequest) -> Vec<String> {
    let mut arguments = Vec::new();
    if let Some(app_path) = request
        .app_path
        .as_ref()
        .filter(|path| !path.as_os_str().is_empty())
    {
        arguments.push("--app-path".to_string());
        arguments.push(app_path.to_string_lossy().to_string());
    }
    arguments.extend([
        "--debug-port".to_string(),
        request.debug_port.to_string(),
        "--helper-port".to_string(),
        request.helper_port.to_string(),
    ]);
    arguments
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;

    #[derive(Default)]
    struct FakeRuntime {
        exe: PathBuf,
        helper_exists: bool,
        events: Mutex<Vec<String>>,
    }

    impl EnhancedLaunchRuntime for FakeRuntime {
        fn current_exe(&self) -> anyhow::Result<PathBuf> {
            Ok(self.exe.clone())
        }

        fn path_exists(&self, _path: &Path) -> bool {
            self.helper_exists
        }

        fn stop_launcher_processes(&self) {
            self.events.lock().unwrap().push("stop-launcher".into());
        }

        fn stop_codex_processes(&self) {
            self.events.lock().unwrap().push("stop-codex".into());
        }

        fn spawn_hidden(&self, plan: &HelperLaunchPlan) -> anyhow::Result<()> {
            self.events.lock().unwrap().push(format!(
                "spawn:{}:{}",
                plan.executable.display(),
                plan.arguments.join("|")
            ));
            Ok(())
        }
    }

    fn request() -> EnhancedLaunchRequest {
        EnhancedLaunchRequest {
            app_path: Some(PathBuf::from("/Applications/Codex.app")),
            debug_port: 9333,
            helper_port: 57322,
        }
    }

    #[test]
    fn launch_builds_the_complete_hidden_helper_request() {
        let runtime = FakeRuntime {
            exe: PathBuf::from("/opt/ChatGPT++/chatgpt-plus-plus-manager"),
            helper_exists: true,
            ..Default::default()
        };

        start_enhanced_codex_with(&runtime, EnhancedLaunchAction::Launch, request()).unwrap();

        assert_eq!(
            runtime.events.lock().unwrap().as_slice(),
            [
                "spawn:/opt/ChatGPT++/chatgpt-plus-plus:--app-path|/Applications/Codex.app|--debug-port|9333|--helper-port|57322"
            ]
        );
    }

    #[test]
    fn restart_stops_owned_processes_before_spawning_the_helper() {
        let runtime = FakeRuntime {
            exe: PathBuf::from("/opt/ChatGPT++/chatgpt-plus-plus-manager"),
            helper_exists: true,
            ..Default::default()
        };

        start_enhanced_codex_with(&runtime, EnhancedLaunchAction::Restart, request()).unwrap();

        assert_eq!(
            runtime.events.lock().unwrap().as_slice(),
            [
                "stop-launcher",
                "stop-codex",
                "spawn:/opt/ChatGPT++/chatgpt-plus-plus:--app-path|/Applications/Codex.app|--debug-port|9333|--helper-port|57322",
            ]
        );
    }

    #[test]
    fn missing_helper_has_a_single_app_repair_message() {
        let runtime = FakeRuntime {
            exe: PathBuf::from("/Applications/ChatGPT++.app/Contents/MacOS/ChatGPTPlusPlus"),
            helper_exists: false,
            ..Default::default()
        };

        let error = start_enhanced_codex_with(&runtime, EnhancedLaunchAction::Launch, request())
            .unwrap_err()
            .to_string();

        assert!(error.contains("内部启动 helper 缺失"));
        assert!(error.contains("Contents/Helpers/chatgpt-plus-plus"));
        assert!(error.contains("重新安装或修复 ChatGPT++"));
        assert!(!error.contains("管理工具"));
    }

    #[test]
    fn explicit_exit_signal_is_consumed_without_touching_other_app_data() {
        let root = tempfile::tempdir().unwrap();
        let signal = root.path().join("launcher.shutdown");
        let settings = root.path().join("settings.json");
        std::fs::write(&settings, "keep").unwrap();

        request_shutdown_at(&signal).unwrap();
        assert!(signal.exists());
        assert!(consume_shutdown_at(&signal).unwrap());
        assert!(!signal.exists());
        assert_eq!(std::fs::read_to_string(settings).unwrap(), "keep");
    }
}
