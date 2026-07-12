use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use chatgpt_plus_core::launcher::{
    CodexLaunch, LaunchHooks, LaunchOptions, MacosCleanupPolicy, ProcessWaitStrategy,
    build_codex_arguments, build_codex_arguments_for_settings, build_codex_command,
    build_macos_cleanup_command, build_macos_open_command, build_packaged_activation,
    launch_codex_with_hooks,
};
use chatgpt_plus_core::settings::{BackendSettings, RelayProtocol};
use chatgpt_plus_core::status::StatusStore;

#[test]
fn launcher_arguments_do_not_enable_renderer_remote_debugging() {
    let args =
        build_codex_arguments(&[" --force_high_performance_gpu ".to_string(), String::new()]);

    assert_eq!(args, ["--force_high_performance_gpu"]);
    assert!(!args.iter().any(|arg| arg.contains("remote-debugging")));
    assert!(!args.iter().any(|arg| arg.contains("remote-allow-origins")));
}

#[test]
fn fast_startup_remains_an_explicit_non_renderer_launch_option() {
    let settings = BackendSettings {
        codex_app_fast_startup: true,
        codex_extra_args: vec!["--force_high_performance_gpu".to_string()],
        ..BackendSettings::default()
    };

    let args = build_codex_arguments_for_settings(&settings);

    assert!(args[0].starts_with("--host-resolver-rules="));
    assert_eq!(args[1], "--force_high_performance_gpu");
}

#[test]
fn direct_executable_command_contains_only_official_path_and_user_arguments() {
    let app_dir = PathBuf::from("C:/Program Files/OpenAI/Codex/app");
    let command = build_codex_command(&app_dir, &["--disable-gpu".to_string()]);

    assert!(command[0].to_ascii_lowercase().ends_with("codex.exe"));
    assert_eq!(command[1..], ["--disable-gpu"]);
}

#[test]
fn packaged_activation_does_not_require_a_debug_port() {
    let app_dir =
        PathBuf::from(r"C:\Program Files\WindowsApps\OpenAI.Codex_1.2.3.0_x64__2p2nqsd0c76g0\app");
    let activation = build_packaged_activation(&app_dir, &["--disable-gpu".to_string()]).unwrap();

    let CodexLaunch::PackagedActivation { arguments, .. } = activation else {
        panic!("expected packaged activation");
    };
    assert_eq!(arguments, "--disable-gpu");
}

#[test]
fn macos_open_command_keeps_official_app_launch_without_cdp_flags() {
    let command = build_macos_open_command(
        Path::new("/Applications/ChatGPT.app"),
        &["--disable-gpu".to_string()],
    );

    assert_eq!(
        command,
        [
            "open",
            "-W",
            "-a",
            "/Applications/ChatGPT.app",
            "--args",
            "--disable-gpu",
        ]
    );
}

#[test]
fn macos_cleanup_respects_preexisting_official_app() {
    assert_eq!(
        build_macos_cleanup_command(
            Path::new("/Applications/ChatGPT.app"),
            MacosCleanupPolicy::SkipQuitBecauseAlreadyRunning,
        ),
        None
    );
    assert!(
        build_macos_cleanup_command(
            Path::new("/Applications/ChatGPT.app"),
            MacosCleanupPolicy::QuitIfNotPreviouslyRunning,
        )
        .is_some()
    );
}

#[derive(Clone)]
struct FakeHooks {
    settings: BackendSettings,
    events: Arc<Mutex<Vec<String>>>,
}

impl FakeHooks {
    fn new(settings: BackendSettings) -> Self {
        Self {
            settings,
            events: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn event(&self, value: impl Into<String>) {
        self.events.lock().unwrap().push(value.into());
    }
}

#[async_trait(?Send)]
impl LaunchHooks for FakeHooks {
    fn resolve_app_dir(
        &self,
        app_dir: Option<&Path>,
        _settings: &BackendSettings,
    ) -> anyhow::Result<PathBuf> {
        Ok(app_dir
            .unwrap_or(Path::new("/Applications/ChatGPT.app"))
            .to_path_buf())
    }

    fn select_helper_port(&self, requested: u16) -> u16 {
        requested
    }

    async fn load_settings(&self) -> anyhow::Result<BackendSettings> {
        Ok(self.settings.clone())
    }

    async fn run_provider_sync(&self) -> anyhow::Result<()> {
        self.event("provider-sync");
        Ok(())
    }

    async fn ensure_plugin_marketplace_config(
        &self,
        _settings: &BackendSettings,
    ) -> anyhow::Result<()> {
        self.event("marketplace-config");
        Ok(())
    }

    fn sanitize_historical_model_suffixes(
        &self,
    ) -> anyhow::Result<chatgpt_plus_core::codex_sqlite::SanitizeModelSuffixResult> {
        Ok(Default::default())
    }

    async fn start_helper(&self, helper_port: u16) -> anyhow::Result<()> {
        self.event(format!("helper:{helper_port}"));
        Ok(())
    }

    async fn launch_codex(
        &self,
        _app_dir: &Path,
        _settings: &BackendSettings,
        extra_args: &[String],
    ) -> anyhow::Result<CodexLaunch> {
        self.event(format!("launch:{}", extra_args.join("|")));
        Ok(CodexLaunch::Process {
            command: vec!["official-app".to_string()],
            wait_strategy: ProcessWaitStrategy::TrackedChild,
            macos_cleanup_policy: None,
        })
    }

    async fn write_status(&self, status: &str) {
        self.event(format!("status:{status}"));
    }

    async fn wait_for_codex_exit(&self, _launch: &CodexLaunch) -> anyhow::Result<()> {
        self.event("wait");
        Ok(())
    }

    async fn shutdown_helper(&self, helper_port: u16) {
        self.event(format!("shutdown-helper:{helper_port}"));
    }

    async fn terminate_codex(&self, _launch: &CodexLaunch) {
        self.event("terminate");
    }
}

fn options(temp: &tempfile::TempDir) -> LaunchOptions {
    LaunchOptions {
        app_dir: Some(PathBuf::from("/Applications/ChatGPT.app")),
        helper_port: 57321,
        status_store: StatusStore::new(temp.path().join("latest-status.json")),
    }
}

#[tokio::test]
async fn official_launch_does_not_start_renderer_helper_or_injection() {
    let temp = tempfile::tempdir().unwrap();
    let hooks = FakeHooks::new(BackendSettings::default());

    let handle = launch_codex_with_hooks(options(&temp), &hooks)
        .await
        .unwrap();
    handle.wait_for_codex_exit().await.unwrap();

    let events = hooks.events.lock().unwrap().clone();
    assert_eq!(
        events,
        ["marketplace-config", "launch:", "status:running", "wait"]
    );
    let status = StatusStore::new(temp.path().join("latest-status.json"))
        .load_latest()
        .unwrap()
        .unwrap();
    assert_eq!(status.status, "running");
}

#[tokio::test]
async fn chat_protocol_proxy_starts_only_the_protocol_helper() {
    let temp = tempfile::tempdir().unwrap();
    let mut settings = BackendSettings::default();
    settings.relay_profiles[0].protocol = RelayProtocol::ChatCompletions;
    let hooks = FakeHooks::new(settings);

    let handle = launch_codex_with_hooks(options(&temp), &hooks)
        .await
        .unwrap();
    handle.wait_for_codex_exit().await.unwrap();

    let events = hooks.events.lock().unwrap().clone();
    assert!(events.contains(&"helper:57321".to_string()));
    assert!(events.contains(&"shutdown-helper:57321".to_string()));
    assert!(!events.iter().any(|event| event.contains("inject")));
}

#[tokio::test]
async fn provider_sync_and_plugin_configuration_remain_prelaunch_maintenance() {
    let temp = tempfile::tempdir().unwrap();
    let hooks = FakeHooks::new(BackendSettings {
        provider_sync_enabled: true,
        ..BackendSettings::default()
    });

    launch_codex_with_hooks(options(&temp), &hooks)
        .await
        .unwrap();

    let events = hooks.events.lock().unwrap().clone();
    assert_eq!(
        &events[..3],
        ["provider-sync", "marketplace-config", "launch:"]
    );
}
