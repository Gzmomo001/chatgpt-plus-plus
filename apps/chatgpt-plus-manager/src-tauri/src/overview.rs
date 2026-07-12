use std::path::PathBuf;

use chatgpt_plus_core::settings::SettingsStore;
use chatgpt_plus_core::status::{LaunchStatus, StatusStore};
use serde::Serialize;

use crate::install;

#[derive(Debug, Clone, Serialize)]
pub struct PathState {
    pub status: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OverviewPayload {
    pub codex_app: PathState,
    pub codex_version: Option<String>,
    pub app_shortcut: PathState,
    pub legacy_management_shortcut: PathState,
    pub latest_launch: Option<LaunchStatus>,
    pub current_version: String,
    pub update_status: String,
    pub settings_path: String,
    pub logs_path: String,
}

pub fn load_overview_payload() -> OverviewPayload {
    let settings = SettingsStore::default().load().unwrap_or_default();
    let codex_app_path = chatgpt_plus_core::app_paths::resolve_codex_app_dir_with_saved(
        None,
        Some(settings.codex_app_path.as_str()),
    );
    let entrypoints = install::inspect_entrypoints();
    OverviewPayload {
        codex_version: codex_app_path
            .as_deref()
            .and_then(chatgpt_plus_core::app_paths::codex_app_version),
        codex_app: path_state(codex_app_path),
        app_shortcut: shortcut_state(entrypoints.app_shortcut),
        legacy_management_shortcut: shortcut_state(entrypoints.legacy_management_shortcut),
        latest_launch: StatusStore::default().load_latest().unwrap_or(None),
        current_version: chatgpt_plus_core::version::VERSION.to_string(),
        update_status: "not_checked".to_string(),
        settings_path: chatgpt_plus_core::paths::default_settings_path()
            .to_string_lossy()
            .to_string(),
        logs_path: chatgpt_plus_core::paths::default_diagnostic_log_path()
            .to_string_lossy()
            .to_string(),
    }
}

pub fn unavailable_overview_payload() -> OverviewPayload {
    OverviewPayload {
        codex_app: path_state(None),
        codex_version: None,
        app_shortcut: path_state(None),
        legacy_management_shortcut: path_state(None),
        latest_launch: None,
        current_version: chatgpt_plus_core::version::VERSION.to_string(),
        update_status: "not_checked".to_string(),
        settings_path: chatgpt_plus_core::paths::default_settings_path()
            .to_string_lossy()
            .to_string(),
        logs_path: chatgpt_plus_core::paths::default_diagnostic_log_path()
            .to_string_lossy()
            .to_string(),
    }
}

fn path_state(path: Option<PathBuf>) -> PathState {
    match path {
        Some(path) => PathState {
            status: "found".to_string(),
            path: Some(path.to_string_lossy().to_string()),
        },
        None => PathState {
            status: "missing".to_string(),
            path: None,
        },
    }
}

fn shortcut_state(shortcut: install::ShortcutState) -> PathState {
    PathState {
        status: if shortcut.installed {
            "installed".to_string()
        } else {
            "missing".to_string()
        },
        path: shortcut.path,
    }
}
