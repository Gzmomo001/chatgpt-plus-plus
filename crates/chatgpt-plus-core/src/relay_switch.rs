use std::path::Path;

use crate::settings::{BackendSettings, SettingsStore};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelaySwitchResult {
    pub settings: BackendSettings,
    pub configured: bool,
    pub backup_path: Option<String>,
}

pub fn switch_relay_profile_in_home(
    store: &SettingsStore,
    home: &Path,
    next_settings: BackendSettings,
    _previous_active_relay_id: &str,
) -> anyhow::Result<RelaySwitchResult> {
    let target_id = next_settings.active_relay_id.clone();
    let activation = crate::codex_home_apply::activate(store, home, next_settings, &target_id)?;
    Ok(RelaySwitchResult {
        settings: activation.settings,
        configured: activation.home.status.configured,
        backup_path: activation
            .home
            .backup_path
            .map(|path| path.to_string_lossy().to_string()),
    })
}
