#[cfg(windows)]
use std::path::Path;
use std::path::PathBuf;

use super::{InstallOptions, MANAGER_BINARY, install_root_or_default, option_or_current_exe};

#[cfg(windows)]
const LEGACY_AUTOSTART_RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(windows)]
const LEGACY_AUTOSTART_RUN_VALUE: &str = "ChatGPTPlusPlusWatcher";
#[cfg(windows)]
const LEGACY_AUTOSTART_SHORTCUT_NAME: &str = "ChatGPTPlusPlusWatcher.lnk";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowsEntrypointPlan {
    pub install_root: String,
    pub app_shortcut: String,
    pub legacy_management_shortcut: String,
    pub app_shortcut_target: String,
}

pub fn build_windows_entrypoint_plan(options: &InstallOptions) -> WindowsEntrypointPlan {
    let install_root = install_root_or_default(options);
    let manager_path = option_or_current_exe(&options.manager_path, MANAGER_BINARY);
    WindowsEntrypointPlan {
        app_shortcut: install_root
            .join("ChatGPT++.lnk")
            .to_string_lossy()
            .to_string(),
        legacy_management_shortcut: install_root
            .join("ChatGPT++ 管理工具.lnk")
            .to_string_lossy()
            .to_string(),
        app_shortcut_target: manager_path.to_string_lossy().to_string(),
        install_root: install_root.to_string_lossy().to_string(),
    }
}

#[cfg(windows)]
pub fn install_shortcuts(options: &InstallOptions) -> anyhow::Result<()> {
    let plan = build_windows_entrypoint_plan(options);
    let install_root = PathBuf::from(&plan.install_root);
    std::fs::create_dir_all(&install_root)?;
    let _ = std::fs::remove_file(&plan.legacy_management_shortcut);
    create_entrypoint_shortcut(
        PathBuf::from(&plan.app_shortcut),
        PathBuf::from(&plan.app_shortcut_target),
        "Open ChatGPT++",
        PathBuf::from(&plan.app_shortcut_target),
    )?;
    Ok(())
}

#[cfg(not(windows))]
pub fn install_shortcuts(_options: &InstallOptions) -> anyhow::Result<()> {
    anyhow::bail!("Windows shortcuts are only supported on Windows")
}

#[cfg(windows)]
pub fn cleanup_legacy_autostart() -> anyhow::Result<Vec<PathBuf>> {
    crate::windows_integration::delete_current_user_value(
        LEGACY_AUTOSTART_RUN_KEY,
        LEGACY_AUTOSTART_RUN_VALUE,
    )?;
    let Some(app_data) = std::env::var_os("APPDATA") else {
        return Ok(Vec::new());
    };
    let shortcut = PathBuf::from(app_data)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Startup")
        .join(LEGACY_AUTOSTART_SHORTCUT_NAME);
    if !shortcut.exists() {
        return Ok(Vec::new());
    }
    std::fs::remove_file(&shortcut)?;
    Ok(vec![shortcut])
}

#[cfg(not(windows))]
pub fn cleanup_legacy_autostart() -> anyhow::Result<Vec<PathBuf>> {
    Ok(Vec::new())
}

#[cfg(windows)]
fn create_entrypoint_shortcut(
    path: PathBuf,
    target: PathBuf,
    description: &str,
    icon: PathBuf,
) -> anyhow::Result<()> {
    crate::windows_integration::create_shortcut(&crate::windows_integration::ShortcutSpec {
        working_directory: target.parent().map(Path::to_path_buf),
        path,
        target,
        arguments: String::new(),
        description: description.to_string(),
        icon: Some(icon),
        show_minimized: false,
    })
}
