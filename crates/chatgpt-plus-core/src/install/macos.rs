#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use super::{
    InstallOptions, LEGACY_MANAGER_NAME, MACOS_MAIN_EXECUTABLE, MANAGER_BINARY, MacosAppBundle,
    SILENT_BINARY, SILENT_NAME, install_root_or_default, option_or_current_exe,
};

pub fn build_app_bundle(options: &InstallOptions) -> MacosAppBundle {
    let install_root = install_root_or_default(options);
    let main_binary_source = install_binary_source(
        option_or_current_exe(&options.manager_path, MANAGER_BINARY),
        MANAGER_BINARY,
    );
    let helper_binary_source = install_binary_source(
        option_or_current_exe(&options.launcher_path, SILENT_BINARY),
        SILENT_BINARY,
    );
    MacosAppBundle {
        app_path: install_root.join(format!("{SILENT_NAME}.app")),
        info_plist: info_plist(SILENT_NAME, MACOS_MAIN_EXECUTABLE),
        main_binary_source: Some(main_binary_source),
        main_binary_target_name: Some(MACOS_MAIN_EXECUTABLE.to_string()),
        helper_binary_source: Some(helper_binary_source),
        helper_binary_target_name: Some(SILENT_BINARY.to_string()),
    }
}

fn install_binary_source(target: std::path::PathBuf, binary: &str) -> std::path::PathBuf {
    if is_bundle_macos_target(&target) {
        let sidecar = target
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(binary);
        if sidecar.exists() {
            return sidecar;
        }
    }
    target
}

fn is_bundle_macos_target(target: &Path) -> bool {
    target
        .parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
        == Some("MacOS")
        && target
            .parent()
            .and_then(|parent| parent.parent())
            .and_then(|parent| parent.file_name())
            .and_then(|name| name.to_str())
            == Some("Contents")
}

#[cfg(target_os = "macos")]
pub fn install_app_bundles(options: &InstallOptions) -> anyhow::Result<()> {
    let install_root = install_root_or_default(options);
    write_bundle(&build_app_bundle(options))?;
    remove_legacy_manager_app(&install_root)?;
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn uninstall_app_bundles(options: &InstallOptions) -> anyhow::Result<()> {
    let install_root = install_root_or_default(options);
    for name in [SILENT_NAME, LEGACY_MANAGER_NAME] {
        let app = install_root.join(format!("{name}.app"));
        if app.exists() {
            fs::remove_dir_all(app)?;
        }
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn install_app_bundles(_options: &InstallOptions) -> anyhow::Result<()> {
    anyhow::bail!("macOS app bundles are only supported on macOS")
}

#[cfg(not(target_os = "macos"))]
pub fn uninstall_app_bundles(_options: &InstallOptions) -> anyhow::Result<()> {
    anyhow::bail!("macOS app bundles are only supported on macOS")
}

#[cfg(target_os = "macos")]
fn write_bundle(bundle: &MacosAppBundle) -> anyhow::Result<()> {
    let contents = bundle.app_path.join("Contents");
    let macos = contents.join("MacOS");
    let helpers = contents.join("Helpers");
    let resources = contents.join("Resources");
    fs::create_dir_all(&macos)?;
    fs::create_dir_all(&helpers)?;
    fs::create_dir_all(&resources)?;
    fs::write(contents.join("Info.plist"), &bundle.info_plist)?;
    copy_executable(
        bundle.main_binary_source.as_ref(),
        bundle.main_binary_target_name.as_deref(),
        &macos,
    )?;
    copy_executable(
        bundle.helper_binary_source.as_ref(),
        bundle.helper_binary_target_name.as_deref(),
        &helpers,
    )?;
    copy_icon(&resources)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn copy_executable(
    source: Option<&std::path::PathBuf>,
    target_name: Option<&str>,
    target_dir: &Path,
) -> anyhow::Result<()> {
    let (Some(source), Some(target_name)) = (source, target_name) else {
        return Ok(());
    };
    if !source.exists() {
        anyhow::bail!("内部可执行文件不存在：{}", source.to_string_lossy());
    }
    let target = target_dir.join(target_name);
    if source != &target {
        fs::copy(source, &target)?;
    }
    let mut permissions = fs::metadata(&target)?.permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(target, permissions)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn remove_legacy_manager_app(install_root: &Path) -> anyhow::Result<()> {
    let legacy = install_root.join(format!("{LEGACY_MANAGER_NAME}.app"));
    if legacy.exists() {
        fs::remove_dir_all(legacy)?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn copy_icon(resources: &Path) -> anyhow::Result<()> {
    let source = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .map(|path| path.join("chatgpt-plus-plus.png"));
    if let Some(source) = source.filter(|path| path.exists()) {
        fs::copy(source, resources.join("chatgpt-plus-plus.png"))?;
    }
    Ok(())
}

fn info_plist(display_name: &str, executable_name: &str) -> String {
    let version = crate::version::VERSION;
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>{display_name}</string>
  <key>CFBundleDisplayName</key>
  <string>{display_name}</string>
  <key>CFBundleIdentifier</key>
  <string>com.gzmomo001.chatgptplusplus</string>
  <key>CFBundleVersion</key>
  <string>{version}</string>
  <key>CFBundleShortVersionString</key>
  <string>{version}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>{executable_name}</string>
  <key>CFBundleIconFile</key>
  <string>chatgpt-plus-plus.png</string>
  <key>LSUIElement</key>
  <false/>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>"#
    )
}
