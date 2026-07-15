pub mod commands;
pub mod install;
pub mod launch_runtime;
mod overview;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};

#[cfg(debug_assertions)]
const TRAY_ID: &str = "chatgpt_plus_dev_tray";
#[cfg(not(debug_assertions))]
const TRAY_ID: &str = "chatgpt_plus_tray";

static APP_EXITING: AtomicBool = AtomicBool::new(false);
const TRAY_MENU_SHOW: &str = "tray_show_main";
const TRAY_MENU_QUIT: &str = "tray_quit_app";

fn manager_window_title() -> &'static str {
    if cfg!(debug_assertions) {
        "ChatGPT++ Dev"
    } else {
        "ChatGPT++"
    }
}

fn manager_environment() -> &'static str {
    if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    }
}

fn tray_label(label: &str) -> String {
    if cfg!(debug_assertions) {
        format!("{label} (Dev)")
    } else {
        label.to_string()
    }
}

pub fn run() {
    chatgpt_plus_core::diagnostic_log::initialize_diagnostic_log_setting();
    install_panic_logger();
    if !cfg!(debug_assertions) {
        if let Err(error) = chatgpt_plus_core::install::cleanup_legacy_user_entrypoints() {
            let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
                "app.legacy_entrypoint_cleanup_failed",
                serde_json::json!({ "error": error.to_string() }),
            );
        }
    }
    let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
        "manager.start",
        serde_json::json!({
            "version": env!("CARGO_PKG_VERSION"),
            "environment": manager_environment(),
            "guard_port": chatgpt_plus_core::ports::manager_guard_port(),
            "state_dir": chatgpt_plus_core::paths::default_app_state_dir()
        }),
    );
    let Some(_guard) = acquire_single_instance_guard() else {
        return;
    };
    let show_update = commands::settings::startup_should_show_update();
    let app_result = tauri::Builder::default()
        .manage(launch_runtime::ManagedLaunchRuntime::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let url = if show_update {
                "/index.html?showUpdate=1"
            } else {
                "/index.html"
            };
            let mut main_window_builder =
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App(url.into()))
                    .title(manager_window_title())
                    .inner_size(1180.0, 820.0)
                    .min_inner_size(960.0, 720.0);
            #[cfg(target_os = "macos")]
            {
                main_window_builder = main_window_builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true)
                    .initialization_script(
                        "document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('macos-overlay-titlebar'));",
                    );
            }
            if let Some(icon) = app.default_window_icon().cloned() {
                main_window_builder = main_window_builder.icon(icon)?;
            }
            let main_window = main_window_builder.build()?;
            install_tray(app)?;
            register_main_window_events(main_window);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::backend_version,
            commands::settings::startup_options,
            commands::settings::load_overview,
            commands::settings::launch_chatgpt_plus,
            commands::settings::restart_chatgpt_plus,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::save_preference_settings,
            commands::settings::load_ccs_providers,
            commands::settings::import_ccs_providers,
            commands::settings::load_pending_provider_import,
            commands::settings::confirm_pending_provider_import,
            commands::settings::dismiss_pending_provider_import,
            commands::sessions::list_local_sessions,
            commands::sessions::delete_local_session,
            commands::sessions::export_local_session_markdown,
            commands::sessions::load_local_session_usage,
            commands::sessions::load_provider_sync_targets,
            commands::sessions::sync_providers_now,
            commands::install::load_ads,
            commands::install::open_external_url,
            commands::install::install_entrypoints,
            commands::install::uninstall_entrypoints,
            commands::install::repair_shortcuts,
            commands::install::plugin_marketplace_status,
            commands::install::plugin_marketplace_inventory,
            commands::install::mutate_plugin,
            commands::install::register_plugin_marketplace,
            commands::install::refresh_plugin_marketplace,
            commands::install::refresh_remote_plugin_marketplace,
            commands::install::repair_plugin_marketplace,
            commands::install::remote_plugin_marketplace_status,
            commands::install::repair_remote_plugin_marketplace,
            commands::install::check_update,
            commands::install::perform_update,
            commands::diagnostics::open_log_folder,
            commands::diagnostics::copy_diagnostics,
            commands::settings::reset_settings,
            commands::relay::relay_status,
            commands::relay::read_relay_files,
            commands::diagnostics::check_env_conflicts,
            commands::diagnostics::remove_env_conflicts,
            commands::relay::save_relay_file,
            commands::diagnostics::write_diagnostic_event,
            commands::relay::backfill_relay_profile_from_live,
            commands::relay::extract_relay_common_config,
            commands::relay::test_relay_profile,
            commands::relay::diagnose_relay_profile,
            commands::relay::fetch_relay_profile_models,
            commands::relay::switch_relay_profile,
            commands::relay::apply_relay_injection,
            commands::relay::apply_pure_api_injection,
            commands::relay::clear_relay_injection,
            manager_exit_app,
            manager_hide_to_tray,
            update_tray_labels
        ])
        .build(tauri::generate_context!());
    let app = match app_result {
        Ok(app) => app,
        Err(error) => {
            let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.run_failed",
                serde_json::json!({
                    "error": error.to_string()
                }),
            );
            return;
        }
    };
    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
            prepare_app_exit(app_handle);
        }
    });
}

fn install_tray<R: tauri::Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(
        app,
        TRAY_MENU_SHOW,
        tray_label("显示主窗口"),
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(
        app,
        TRAY_MENU_QUIT,
        tray_label("退出程序"),
        true,
        None::<&str>,
    )?;
    let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            TRAY_MENU_SHOW => {
                show_main_window(app);
            }
            TRAY_MENU_QUIT => {
                prepare_app_exit(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                show_main_window(&tray.app_handle());
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let _ = tray_builder.build(app)?;
    Ok(())
}

fn register_main_window_events<R: tauri::Runtime>(window: tauri::WebviewWindow<R>) {
    let event_window = window.clone();
    let minimized_window = event_window.clone();
    let close_event_window = event_window.clone();

    event_window.on_window_event(move |event| match event {
        WindowEvent::Resized(_) => {
            if matches!(minimized_window.is_minimized(), Ok(true)) {
                let _ = minimized_window.hide();
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            if APP_EXITING.load(Ordering::SeqCst) {
                return;
            }

            api.prevent_close();
            let _ = close_event_window.hide();
        }
        _ => {}
    });
}

#[tauri::command]
fn manager_exit_app<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    prepare_app_exit(&app);
    app.exit(0);
}

fn prepare_app_exit<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if APP_EXITING.swap(true, Ordering::SeqCst) {
        return;
    }
    let runtime = app.state::<launch_runtime::ManagedLaunchRuntime>();
    tauri::async_runtime::block_on(runtime.shutdown_owned_resources());
}

#[tauri::command]
fn manager_hide_to_tray<R: tauri::Runtime>(window: tauri::WebviewWindow<R>) {
    let _ = window.hide();
}

#[tauri::command]
fn update_tray_labels<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    show_label: String,
    quit_label: String,
    window_title: String,
) {
    let show_label = tray_label(&show_label);
    let quit_label = tray_label(&quit_label);
    let window_title = if cfg!(debug_assertions) {
        manager_window_title().to_string()
    } else {
        window_title
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let show_item = MenuItem::with_id(&app, TRAY_MENU_SHOW, &show_label, true, None::<&str>);
        let quit_item = MenuItem::with_id(&app, TRAY_MENU_QUIT, &quit_label, true, None::<&str>);
        if let (Ok(show), Ok(quit)) = (show_item, quit_item) {
            if let Ok(menu) = Menu::with_items(&app, &[&show, &quit]) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&window_title);
    }
}

fn show_main_window<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn install_panic_logger() {
    std::panic::set_hook(Box::new(|panic_info| {
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .map(|message| (*message).to_string())
            .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "非字符串 panic payload".to_string());
        let location = panic_info.location().map(|location| {
            serde_json::json!({
                "file": location.file(),
                "line": location.line(),
                "column": location.column()
            })
        });
        let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
            "manager.panic",
            serde_json::json!({
                "payload": payload,
                "location": location
            }),
        );
    }));
}

fn acquire_single_instance_guard() -> Option<chatgpt_plus_core::ports::LoopbackPortGuard> {
    match chatgpt_plus_core::ports::acquire_resilient_loopback_port_guard(
        chatgpt_plus_core::ports::manager_guard_port(),
    ) {
        Ok(guard) => {
            if let Some(fallback_lock_path) = guard.fallback_path() {
                let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
                    "manager.guard_fallback",
                    serde_json::json!({
                        "requested_guard_port": chatgpt_plus_core::ports::manager_guard_port(),
                        "fallback_lock_path": fallback_lock_path
                    }),
                );
            }
            Some(guard)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {
            let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.already_running",
                serde_json::json!({
                    "guard_port": chatgpt_plus_core::ports::manager_guard_port()
                }),
            );
            None
        }
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
            let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.already_running",
                serde_json::json!({
                    "guard_port": chatgpt_plus_core::ports::manager_guard_port()
                }),
            );
            None
        }
        Err(error) => {
            let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.guard_failed",
                serde_json::json!({
                    "guard_port": chatgpt_plus_core::ports::manager_guard_port(),
                    "error": error.to_string()
                }),
            );
            match std::net::TcpListener::bind(("127.0.0.1", 0)) {
                Ok(listener) => Some(chatgpt_plus_core::ports::LoopbackPortGuard::listener(
                    listener,
                )),
                Err(fallback_error) => {
                    let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
                        "manager.guard_fallback_failed",
                        serde_json::json!({
                            "error": fallback_error.to_string()
                        }),
                    );
                    None
                }
            }
        }
    }
}
