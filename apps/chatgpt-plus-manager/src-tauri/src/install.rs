pub use chatgpt_plus_core::install::{
    EntryPointState, InstallActionResult, InstallOptions, ShortcutState, inspect_entrypoints,
};

pub fn install_entrypoints() -> InstallActionResult {
    chatgpt_plus_core::install::install_entrypoints(&InstallOptions::default())
}

pub fn uninstall_entrypoints(options: InstallOptions) -> InstallActionResult {
    chatgpt_plus_core::install::uninstall_entrypoints(&options)
}

pub fn repair_shortcuts() -> InstallActionResult {
    chatgpt_plus_core::install::repair_entrypoints(&InstallOptions::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspect_entrypoints_reports_the_app_and_legacy_cleanup_state() {
        let state = inspect_entrypoints();

        assert!(matches!(state.app_shortcut.installed, true | false));
        assert!(matches!(
            state.legacy_management_shortcut.installed,
            true | false
        ));
    }
}
