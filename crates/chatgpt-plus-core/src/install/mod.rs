use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub mod macos;
pub mod windows;

pub const SILENT_NAME: &str = "ChatGPT++";
pub const LEGACY_MANAGER_NAME: &str = "ChatGPT++ 管理工具";
pub const MANAGER_BINARY: &str = "chatgpt-plus-plus-manager";
pub const MACOS_MAIN_EXECUTABLE: &str = "ChatGPTPlusPlus";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstallOptions {
    #[serde(default)]
    pub install_root: Option<PathBuf>,
    #[serde(default)]
    pub manager_path: Option<PathBuf>,
    #[serde(default)]
    pub remove_owned_data: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ShortcutState {
    pub installed: bool,
    pub path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EntryPointState {
    pub app_shortcut: ShortcutState,
    pub legacy_management_shortcut: ShortcutState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct InstallActionResult {
    pub status: String,
    pub message: String,
    pub app_shortcut: ShortcutState,
    pub legacy_management_shortcut: ShortcutState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MacosAppBundle {
    pub app_path: PathBuf,
    pub info_plist: String,
    pub main_binary_source: Option<PathBuf>,
    pub main_binary_target_name: Option<String>,
}

impl ShortcutState {
    pub fn missing(path: Option<PathBuf>) -> Self {
        Self {
            installed: false,
            path: path.map(|path| path.to_string_lossy().to_string()),
        }
    }

    pub fn from_candidates(candidates: Vec<PathBuf>) -> Self {
        if let Some(path) = candidates.iter().find(|path| path.exists()) {
            return Self {
                installed: true,
                path: Some(path.to_string_lossy().to_string()),
            };
        }
        Self::missing(candidates.into_iter().next())
    }
}

pub fn shortcut_names() -> (&'static str, &'static str) {
    ("ChatGPT++.lnk", "ChatGPT++ 管理工具.lnk")
}

pub fn app_bundle_names() -> (&'static str, &'static str) {
    ("ChatGPT++.app", "ChatGPT++ 管理工具.app")
}

pub fn inspect_entrypoints() -> EntryPointState {
    let root = default_install_root();
    EntryPointState {
        app_shortcut: ShortcutState::from_candidates(entrypoint_candidates(&root, false)),
        legacy_management_shortcut: ShortcutState::from_candidates(entrypoint_candidates(
            &root, true,
        )),
    }
}

pub fn install_entrypoints(options: &InstallOptions) -> InstallActionResult {
    let result = platform_install(options);
    action_result(result, "入口已安装。")
}

pub fn uninstall_entrypoints(options: &InstallOptions) -> InstallActionResult {
    let result = platform_uninstall(options);
    if result.is_ok() && options.remove_owned_data {
        let _ = remove_owned_data();
    }
    action_result(result, "入口已卸载。")
}

pub fn repair_entrypoints(options: &InstallOptions) -> InstallActionResult {
    let result = platform_install(options);
    action_result(result, "入口已修复。")
}

pub fn build_windows_entrypoint_plan(options: &InstallOptions) -> windows::WindowsEntrypointPlan {
    windows::build_windows_entrypoint_plan(options)
}

pub fn build_macos_app_bundle(options: &InstallOptions) -> MacosAppBundle {
    macos::build_app_bundle(options)
}

pub fn remove_owned_data() -> std::io::Result<()> {
    let dir = crate::paths::default_app_state_dir();
    if dir.exists() {
        std::fs::remove_dir_all(dir)?;
    }
    Ok(())
}

pub fn default_install_root() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        return crate::windows_integration::desktop_dir().or_else(|| {
            directories::UserDirs::new().and_then(|dirs| dirs.desktop_dir().map(PathBuf::from))
        });
    }

    #[cfg(target_os = "macos")]
    {
        let sys_apps = PathBuf::from("/Applications");
        if sys_apps.join(format!("{SILENT_NAME}.app")).exists()
            || sys_apps.join(format!("{LEGACY_MANAGER_NAME}.app")).exists()
        {
            return Some(sys_apps);
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = macos_applications_dir_from_exe(&exe) {
                if is_macos_applications_dir(&dir) {
                    return Some(dir);
                }
            }
        }
        return Some(sys_apps);
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        directories::UserDirs::new().and_then(|dirs| dirs.desktop_dir().map(PathBuf::from))
    }
}

pub fn default_install_root_strategy() -> &'static str {
    if cfg!(windows) {
        "windows-known-folder"
    } else if cfg!(target_os = "macos") {
        "macos-applications"
    } else {
        "user-dirs-desktop"
    }
}

fn platform_install(options: &InstallOptions) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        windows::install_shortcuts(options)
    }

    #[cfg(target_os = "macos")]
    {
        macos::install_app_bundles(options)
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = options;
        anyhow::bail!("当前平台暂不支持安装 ChatGPT++ 入口")
    }
}

fn platform_uninstall(options: &InstallOptions) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        let _ = options;
        anyhow::bail!("Windows 仅支持创建 ChatGPT++ 快捷方式")
    }

    #[cfg(target_os = "macos")]
    {
        macos::uninstall_app_bundles(options)
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = options;
        anyhow::bail!("当前平台暂不支持卸载 ChatGPT++ 入口")
    }
}

fn action_result(result: anyhow::Result<()>, success_message: &str) -> InstallActionResult {
    let state = inspect_entrypoints();
    match result {
        Ok(()) => InstallActionResult {
            status: "ok".to_string(),
            message: success_message.to_string(),
            app_shortcut: state.app_shortcut,
            legacy_management_shortcut: state.legacy_management_shortcut,
        },
        Err(error) => InstallActionResult {
            status: "failed".to_string(),
            message: error.to_string(),
            app_shortcut: state.app_shortcut,
            legacy_management_shortcut: state.legacy_management_shortcut,
        },
    }
}

fn entrypoint_candidates(root: &Option<PathBuf>, manager: bool) -> Vec<PathBuf> {
    let Some(root) = root else {
        return Vec::new();
    };
    let name = if manager {
        LEGACY_MANAGER_NAME
    } else {
        SILENT_NAME
    };
    if cfg!(windows) {
        vec![root.join(format!("{name}.lnk"))]
    } else if cfg!(target_os = "macos") {
        vec![root.join(format!("{name}.app"))]
    } else {
        vec![root.join(format!("{name}.desktop"))]
    }
}

pub fn option_or_current_exe(value: &Option<PathBuf>, binary: &str) -> PathBuf {
    if let Some(value) = value {
        return value.clone();
    }
    let _ = binary;
    std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn legacy_entrypoint_paths(root: &Path, windows: bool) -> Vec<PathBuf> {
    let extension = if windows { "lnk" } else { "app" };
    vec![root.join(format!("{LEGACY_MANAGER_NAME}.{extension}"))]
}

pub fn cleanup_legacy_user_entrypoints() -> anyhow::Result<Vec<PathBuf>> {
    let mut removed = Vec::new();

    #[cfg(target_os = "macos")]
    {
        if let Ok(exe) = std::env::current_exe()
            && let Some((applications_dir, app_name)) =
                macos_applications_dir_and_app_name_from_exe(&exe)
            && app_name == format!("{SILENT_NAME}.app")
        {
            removed.extend(cleanup_legacy_entrypoints_at(&applications_dir, false)?);
        }
    }

    #[cfg(windows)]
    {
        removed.extend(windows::cleanup_legacy_autostart()?);
        let mut roots = Vec::new();
        if let Some(desktop) = crate::windows_integration::desktop_dir() {
            roots.push(desktop);
        }
        if let Some(app_data) = std::env::var_os("APPDATA") {
            roots.push(
                PathBuf::from(app_data)
                    .join("Microsoft")
                    .join("Windows")
                    .join("Start Menu")
                    .join("Programs")
                    .join(SILENT_NAME),
            );
        }
        for root in roots {
            removed.extend(cleanup_legacy_entrypoints_at(&root, true)?);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        for path in retired_launcher_paths_from_exe(&exe) {
            if !path.exists() {
                continue;
            }
            std::fs::remove_file(&path)?;
            if let Some(parent) = path.parent()
                && parent.file_name().and_then(|name| name.to_str()) == Some("Helpers")
            {
                let _ = std::fs::remove_dir(parent);
            }
            removed.push(path);
        }
    }

    Ok(removed)
}

pub fn retired_launcher_paths_from_exe(exe: &Path) -> Vec<PathBuf> {
    let mut path = exe;
    while let Some(parent) = path.parent() {
        if path.extension().and_then(|extension| extension.to_str()) == Some("app") {
            return vec![path.join("Contents/Helpers/chatgpt-plus-plus")];
        }
        path = parent;
    }
    let Some(parent) = exe.parent() else {
        return Vec::new();
    };
    let filename = if exe.extension().and_then(|extension| extension.to_str()) == Some("exe") {
        "chatgpt-plus-plus.exe"
    } else {
        "chatgpt-plus-plus"
    };
    vec![parent.join(filename)]
}

fn cleanup_legacy_entrypoints_at(root: &Path, windows: bool) -> anyhow::Result<Vec<PathBuf>> {
    let mut removed = Vec::new();
    for path in legacy_entrypoint_paths(root, windows) {
        if !path.exists() {
            continue;
        }
        if windows {
            std::fs::remove_file(&path)?;
        } else {
            std::fs::remove_dir_all(&path)?;
        }
        removed.push(path);
    }
    Ok(removed)
}

#[cfg(target_os = "macos")]
fn macos_applications_dir_from_exe(exe: &Path) -> Option<PathBuf> {
    macos_applications_dir_and_app_name_from_exe(exe).map(|(dir, _)| dir)
}

fn macos_applications_dir_and_app_name_from_exe(exe: &Path) -> Option<(PathBuf, String)> {
    let mut path = exe;
    while let Some(parent) = path.parent() {
        if path.extension().and_then(|extension| extension.to_str()) == Some("app") {
            let app_name = path.file_name()?.to_string_lossy().to_string();
            return Some((parent.to_path_buf(), app_name));
        }
        path = parent;
    }
    None
}

#[cfg(target_os = "macos")]
fn is_macos_applications_dir(path: &Path) -> bool {
    if path == Path::new("/Applications") {
        return true;
    }
    directories::BaseDirs::new()
        .map(|dirs| path == dirs.home_dir().join("Applications"))
        .unwrap_or(false)
}

pub(crate) fn install_root_or_default(options: &InstallOptions) -> PathBuf {
    options
        .install_root
        .clone()
        .or_else(default_install_root)
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_cleanup_removes_only_the_old_entrypoint_and_preserves_user_data() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("ChatGPT++ 管理工具.app");
        let user_data = root.path().join(".chatgpt-plus-plus");
        std::fs::create_dir_all(&legacy).unwrap();
        std::fs::create_dir_all(&user_data).unwrap();
        std::fs::write(user_data.join("settings.json"), "keep").unwrap();

        let removed = cleanup_legacy_entrypoints_at(root.path(), false).unwrap();

        assert_eq!(removed, vec![legacy.clone()]);
        assert!(!legacy.exists());
        assert_eq!(
            std::fs::read_to_string(user_data.join("settings.json")).unwrap(),
            "keep"
        );
    }
}
