use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const APP_STATE_DIR: &str = ".chatgpt-plus-plus";
const LEGACY_APP_STATE_DIR: &str = ".codex-session-delete";
const SETTINGS_FILE: &str = "settings.json";
const LATEST_STATUS_FILE: &str = "latest-status.json";
const DIAGNOSTIC_LOG_FILE: &str = "chatgpt-plus.log";
const PENDING_PROVIDER_IMPORT_FILE: &str = "pending-provider-import.json";

pub fn default_app_state_dir() -> PathBuf {
    if let Some(home_dir) = directories::BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf()) {
        return app_state_dir_from_home(&home_dir);
    }

    PathBuf::from(APP_STATE_DIR)
}

fn app_state_dir_from_home(home_dir: &Path) -> PathBuf {
    let current = home_dir.join(APP_STATE_DIR);
    if current.exists() {
        return current;
    }

    let legacy = home_dir.join(LEGACY_APP_STATE_DIR);
    if legacy.exists() {
        return legacy;
    }

    current
}

pub fn default_settings_path() -> PathBuf {
    if let Some(path) = settings_path_for_tests() {
        return path;
    }
    default_app_state_dir().join(SETTINGS_FILE)
}

pub fn default_latest_status_path() -> PathBuf {
    default_app_state_dir().join(LATEST_STATUS_FILE)
}

pub fn default_diagnostic_log_path() -> PathBuf {
    default_app_state_dir().join(DIAGNOSTIC_LOG_FILE)
}

pub fn default_pending_provider_import_path() -> PathBuf {
    default_app_state_dir().join(PENDING_PROVIDER_IMPORT_FILE)
}

fn settings_path_for_tests() -> Option<PathBuf> {
    SETTINGS_PATH_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|path| path.clone())
}

static SETTINGS_PATH_FOR_TESTS: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

pub fn set_settings_path_for_tests(path: Option<PathBuf>) -> Option<PathBuf> {
    SETTINGS_PATH_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|mut current| std::mem::replace(&mut *current, path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_state_dir_defaults_to_new_brand_directory() {
        let home = tempfile::tempdir().unwrap();

        assert_eq!(
            app_state_dir_from_home(home.path()),
            home.path().join(".chatgpt-plus-plus")
        );
    }

    #[test]
    fn app_state_dir_falls_back_to_legacy_directory() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir(home.path().join(".codex-session-delete")).unwrap();

        assert_eq!(
            app_state_dir_from_home(home.path()),
            home.path().join(".codex-session-delete")
        );
    }

    #[test]
    fn app_state_dir_prefers_new_directory_when_both_exist() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir(home.path().join(".codex-session-delete")).unwrap();
        std::fs::create_dir(home.path().join(".chatgpt-plus-plus")).unwrap();

        assert_eq!(
            app_state_dir_from_home(home.path()),
            home.path().join(".chatgpt-plus-plus")
        );
    }

    #[test]
    fn default_settings_path_uses_app_state_directory() {
        let path = default_settings_path();

        assert!(path.ends_with("settings.json"));
    }

    #[test]
    fn default_latest_status_path_uses_app_state_directory() {
        let path = default_latest_status_path();

        assert!(path.ends_with("latest-status.json"));
    }

    #[test]
    fn default_diagnostic_log_path_uses_app_state_directory() {
        let path = default_diagnostic_log_path();

        assert!(path.ends_with("chatgpt-plus.log"));
    }

    #[test]
    fn default_pending_provider_import_path_uses_app_state_directory() {
        let path = default_pending_provider_import_path();

        assert!(path.ends_with("pending-provider-import.json"));
    }
}
