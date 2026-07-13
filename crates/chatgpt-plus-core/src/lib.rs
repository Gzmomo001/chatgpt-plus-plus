pub mod ads;
pub mod app_paths;
mod atomic_file;
pub mod branding;
pub mod ccs_import;
pub mod codex_home;
pub mod codex_home_apply;
pub mod codex_sqlite;
mod computer_use_guard;
pub mod diagnostic_log;
pub mod env_conflicts;
pub mod http_client;
pub mod install;
pub mod launcher;
pub mod model_catalog;
pub mod model_catalog_materializer;
pub mod model_suffix;
pub mod models;
pub mod native_image_generation;
pub mod paths;
pub mod plugin_marketplace;
pub mod ports;
pub mod protocol_proxy;
pub mod provider_doctor;
pub mod provider_import;
pub mod proxy;
pub use codex_home_apply::relay_config;
pub mod relay_rotation;
pub mod settings;
pub mod status;
pub mod update;
pub mod version;
pub mod watcher;
#[cfg(windows)]
mod windows_integration;

#[cfg(test)]
extern crate self as chatgpt_plus_core;

#[cfg(windows)]
pub fn windows_create_no_window() -> u32 {
    windows_integration::CREATE_NO_WINDOW
}

#[cfg(windows)]
pub fn windows_open_url(url: &str) -> anyhow::Result<()> {
    windows_integration::open_url(url)
}

#[cfg(windows)]
pub fn windows_activate_process_window(process_id: u32) -> bool {
    windows_integration::activate_process_window(process_id)
}

#[cfg(windows)]
pub fn windows_apply_chatgptplusplus_icon_to_process_window(
    process_id: u32,
    icon_resource_path: std::path::PathBuf,
) -> bool {
    windows_integration::apply_chatgptplusplus_icon_to_process_window(
        process_id,
        icon_resource_path,
    )
}

#[cfg(windows)]
pub fn windows_enumerate_processes() -> Vec<windows_integration::WindowsProcessInfo> {
    windows_integration::enumerate_processes()
}
