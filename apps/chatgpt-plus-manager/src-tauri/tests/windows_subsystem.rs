fn normalize_source_text(source: &str) -> String {
    source.replace("\r\n", "\n")
}

#[test]
fn source_contract_assertions_accept_windows_crlf() {
    let source = "selectedBeforeSave.id,\r\n    );\r\n";

    assert!(normalize_source_text(source).contains("selectedBeforeSave.id,\n    );"));
}

#[cfg(windows)]
#[test]
fn manager_binary_uses_windows_gui_subsystem_in_debug_and_release() {
    let main_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/main.rs"))
        .expect("read manager main.rs");

    assert!(
        main_rs.contains("#![cfg_attr(windows, windows_subsystem = \"windows\")]"),
        "manager binary should not allocate a console window on Windows"
    );
}

#[test]
fn manager_release_binary_uses_embedded_frontend_assets() {
    let cargo_toml = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml"))
        .expect("read manager Cargo.toml");

    assert!(
        cargo_toml.contains("custom-protocol"),
        "release manager binary should use Tauri custom protocol instead of devUrl localhost"
    );
}

#[test]
fn manager_dev_build_keeps_custom_protocol_opt_in() {
    let cargo_toml = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml"))
        .expect("read manager Cargo.toml");

    assert!(cargo_toml.contains("custom-protocol = [\"tauri/custom-protocol\"]"));
    let tauri_dependency = cargo_toml
        .lines()
        .find(|line| line.trim_start().starts_with("tauri ="))
        .expect("manager should declare the Tauri dependency");
    assert!(
        !tauri_dependency.contains("custom-protocol"),
        "custom-protocol must stay disabled for tauri dev so Vite HMR remains active"
    );
}

#[test]
fn workspace_and_manager_build_do_not_include_an_independent_launcher() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let repository = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .expect("repository root");
    let workspace =
        std::fs::read_to_string(repository.join("Cargo.toml")).expect("read workspace Cargo.toml");
    let package =
        std::fs::read_to_string(repository.join("apps/chatgpt-plus-manager/package.json"))
            .expect("read manager package.json");

    assert!(!workspace.contains("apps/chatgpt-plus-launcher"));
    assert!(!package.contains("chatgpt-plus-launcher"));
    assert!(
        !repository
            .join("apps/chatgpt-plus-launcher/Cargo.toml")
            .exists()
    );
}

#[test]
fn manager_uses_single_instance_guard_before_starting_tauri() {
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");

    assert!(lib_rs.contains("acquire_single_instance_guard()"));
    assert!(lib_rs.contains("manager_guard_port"));
    assert!(lib_rs.contains("manager.already_running"));
}

#[test]
fn development_runtime_isolated_from_installed_production_app() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let package = std::fs::read_to_string(manifest_dir.parent().unwrap().join("package.json"))
        .expect("read manager package.json");
    let release_config =
        std::fs::read_to_string(manifest_dir.join("tauri.conf.json")).expect("read release config");
    let development_config = std::fs::read_to_string(manifest_dir.join("tauri.dev.conf.json"))
        .expect("read development config");
    let lib_rs =
        std::fs::read_to_string(manifest_dir.join("src/lib.rs")).expect("read manager lib.rs");
    let core_paths = std::fs::read_to_string(
        manifest_dir
            .parent()
            .and_then(std::path::Path::parent)
            .and_then(std::path::Path::parent)
            .unwrap()
            .join("crates/chatgpt-plus-core/src/paths.rs"),
    )
    .expect("read core paths");

    assert!(package.contains("tauri dev --config src-tauri/tauri.dev.conf.json"));
    assert!(release_config.contains("com.gzmomo001.chatgptplusplus\""));
    assert!(development_config.contains("com.gzmomo001.chatgptplusplus.dev"));
    assert!(development_config.contains("ChatGPT++ Dev"));
    assert!(lib_rs.contains("manager_window_title()"));
    assert!(lib_rs.contains("ChatGPT++ Dev"));
    assert!(lib_rs.contains("if !cfg!(debug_assertions)"));
    assert!(core_paths.contains(".chatgpt-plus-plus-dev"));
    assert!(
        std::fs::read_to_string(manifest_dir.parent().unwrap().join("src/app/App.tsx"))
            .expect("read manager App.tsx")
            .contains("DEVELOPMENT_RUNTIME")
    );
}

#[test]
fn unified_app_focuses_an_existing_window_and_cleans_only_legacy_entrypoints() {
    let main_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/main.rs"))
        .expect("read manager main.rs");
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");

    assert!(
        main_rs
            .find("focus_existing_manager_window();")
            .is_some_and(|position| {
                position < main_rs.find("chatgpt_plus_manager_lib::run();").unwrap()
            })
    );
    assert!(lib_rs.contains("cleanup_legacy_user_entrypoints()"));
    assert!(lib_rs.contains("app.legacy_entrypoint_cleanup_failed"));
}

#[test]
fn manager_main_window_uses_default_window_icon_explicitly() {
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");

    assert!(lib_rs.contains("main_window_builder"));
    assert!(lib_rs.contains("app.default_window_icon().cloned()"));
    assert!(lib_rs.contains("main_window_builder = main_window_builder.icon(icon)?"));
}

#[test]
fn macos_overlay_titlebar_has_an_authorized_native_drag_path() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/app/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let capability = std::fs::read_to_string(manifest_dir.join("capabilities/default.json"))
        .expect("read manager default capability");

    assert!(app_tsx.contains("getCurrentWindow"));
    assert!(app_tsx.contains("startDragging"));
    assert!(app_tsx.contains("onMouseDown={handleWindowDragMouseDown}"));
    assert!(capability.contains("core:window:allow-start-dragging"));
}

#[test]
fn manager_close_minimizes_to_tray_without_confirmation() {
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/app/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let actions_ts = manifest_dir.parent().unwrap().join("src/app/actions.ts");
    let actions_ts = std::fs::read_to_string(&actions_ts).expect("read manager actions");

    assert!(!lib_rs.contains("MessageDialogButtons"));
    assert!(!lib_rs.contains(".dialog()"));
    assert!(!lib_rs.contains("manager://close-requested"));
    assert!(lib_rs.contains("let _ = close_event_window.hide();"));
    assert!(!app_tsx.contains("CloseConfirmDialog"));
    assert!(actions_ts.contains("manager_exit_app"));
    assert!(actions_ts.contains("manager_hide_to_tray"));
}

#[test]
fn explicit_quit_releases_manager_owned_runtime_but_window_close_does_not() {
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");
    let runtime = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/launch_runtime.rs"
    ))
    .expect("read manager launch runtime");

    assert!(lib_rs.contains("runtime.shutdown_owned_resources()"));
    assert!(lib_rs.contains("WindowEvent::CloseRequested"));
    assert!(lib_rs.contains("tauri::RunEvent::ExitRequested"));
    assert!(lib_rs.contains("APP_EXITING.swap(true, Ordering::SeqCst)"));
    assert!(!lib_rs.contains("launcher.shutdown"));
    assert!(runtime.contains("handle.wait_for_codex_exit().await"));
    assert!(runtime.contains("handle.shutdown_owned_resources().await"));
    assert!(runtime.contains("restart_after_configuration_change"));
}

#[test]
fn manager_queues_chatgptplusplus_provider_urls_for_confirmation_on_startup() {
    let main_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/main.rs"))
        .expect("read manager main.rs");

    assert!(main_rs.contains("chatgptplusplus://"));
    assert!(main_rs.contains("codexplusplus://"));
    assert!(main_rs.contains("provider_import::save_pending_provider_import_from_url"));
    assert!(!main_rs.contains("provider_import::import_provider_from_url"));
    assert!(main_rs.contains("manager.provider_import_url.pending"));
}

#[test]
fn windows_main_binary_requests_administrator_privileges() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let manager_build =
        std::fs::read_to_string(manifest_dir.join("build.rs")).expect("read manager build.rs");
    let windows_manifest = std::fs::read_to_string(manifest_dir.join("windows-app-manifest.xml"))
        .expect("read windows app manifest");
    let windows_installer = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("scripts/installer/windows/ChatGPTPlusPlus.nsi");
    let windows_installer =
        std::fs::read_to_string(&windows_installer).expect("read windows installer");

    assert!(manager_build.contains("windows-app-manifest.xml"));
    assert!(windows_manifest.contains("requireAdministrator"));
    assert!(windows_manifest.contains("Microsoft.Windows.Common-Controls"));
    assert!(windows_installer.contains("RequestExecutionLevel admin"));
}

#[test]
fn windows_entrypoints_only_manage_shortcuts() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let windows_install = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("crates/chatgpt-plus-core/src/install/windows.rs");
    let windows_install =
        std::fs::read_to_string(&windows_install).expect("read windows install source");

    assert!(windows_install.contains("create_entrypoint_shortcut"));
    assert!(!windows_install.contains("Software\\Classes\\chatgptplusplus"));
    assert!(!windows_install.contains("Software\\Classes\\codexplusplus"));
    assert!(!windows_install.contains("URL Protocol"));
}

#[test]
fn manager_launch_button_uses_the_manager_owned_launch_runtime() {
    let commands_rs = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/commands/settings.rs"
    ))
    .expect("read manager settings commands");

    assert!(commands_rs.contains("runtime.start(action, launch_request).await"));
    assert!(!commands_rs.contains("std::process::Command::new"));
    assert!(!commands_rs.contains("companion_binary_path"));
    assert!(!commands_rs.contains("start_enhanced_codex"));
}

#[test]
fn windows_relaunch_fallbacks_target_the_unified_manager_binary() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let repository = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .expect("repository root");
    let launcher =
        std::fs::read_to_string(repository.join("crates/chatgpt-plus-core/src/launcher.rs"))
            .expect("read launch runtime");
    let windows_integration = std::fs::read_to_string(
        repository.join("crates/chatgpt-plus-core/src/windows_integration.rs"),
    )
    .expect("read Windows integration");

    for source in [launcher, windows_integration] {
        assert!(source.contains("chatgpt-plus-plus-manager.exe"));
        assert!(!source.contains("PathBuf::from(\"chatgpt-plus-plus.exe\")"));
        assert!(!source.contains("|| \"chatgpt-plus-plus.exe\".to_string()"));
    }
}

#[test]
fn manager_does_not_register_the_removed_remote_project_commands() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let commands_rs = [
        "commands.rs",
        "commands/shared.rs",
        "commands/sessions.rs",
        "commands/install.rs",
        "commands/diagnostics.rs",
        "commands/settings.rs",
        "commands/relay.rs",
    ]
    .into_iter()
    .map(|path| std::fs::read_to_string(manifest_dir.join("src").join(path)).unwrap())
    .collect::<String>();
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");
    let command_stem = ["zed", "remote"].join("_");
    let handler = lib_rs
        .split("tauri::generate_handler![")
        .nth(1)
        .expect("manager handler registration")
        .split("])")
        .next()
        .expect("manager handler registration end");

    assert_eq!(handler.matches("commands::").count(), 53);
    assert!(!commands_rs.contains(&command_stem));
    assert!(!handler.contains(&command_stem));
}

#[test]
fn manager_command_inventory_matches_annotations_registration_and_frontend_contract() {
    use std::collections::BTreeSet;

    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let command_sources = [
        "shared.rs",
        "sessions.rs",
        "install.rs",
        "diagnostics.rs",
        "settings.rs",
        "relay.rs",
    ]
    .map(|name| manifest_dir.join("src/commands").join(name));
    let annotated_paths = command_sources
        .iter()
        .flat_map(|path| {
            let source = std::fs::read_to_string(path)
                .unwrap_or_else(|error| panic!("read command domain {}: {error}", path.display()));
            let domain = path.file_stem().unwrap().to_string_lossy();
            annotated_command_names(&source)
                .into_iter()
                .map(move |name| format!("commands::{domain}::{name}"))
        })
        .collect::<BTreeSet<_>>();
    let annotated = annotated_paths
        .iter()
        .map(|path| path.rsplit("::").next().unwrap().to_string())
        .collect::<BTreeSet<_>>();

    let lib_rs =
        std::fs::read_to_string(manifest_dir.join("src/lib.rs")).expect("read manager lib.rs");
    let handler = lib_rs
        .split("tauri::generate_handler![")
        .nth(1)
        .expect("manager handler registration")
        .split("])")
        .next()
        .expect("manager handler registration end");
    let registered_paths = handler
        .split(',')
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect::<BTreeSet<_>>();
    let registered = registered_paths
        .iter()
        .map(|path| path.rsplit("::").next().unwrap().to_string())
        .collect::<BTreeSet<_>>();

    let actions = std::fs::read_to_string(manifest_dir.join("../src/app/actions.ts"))
        .expect("read frontend manager actions");
    let frontend = quoted_string_array(&actions, "TAURI_COMMAND_NAMES")
        .into_iter()
        .collect::<BTreeSet<_>>();
    let tray_commands = BTreeSet::from([
        "manager_exit_app".to_string(),
        "manager_hide_to_tray".to_string(),
        "update_tray_labels".to_string(),
    ]);
    let lib_annotated = annotated_command_names(&lib_rs)
        .into_iter()
        .collect::<BTreeSet<_>>();
    let registered_manager = registered_paths
        .iter()
        .filter(|path| path.starts_with("commands::"))
        .cloned()
        .collect::<BTreeSet<_>>();
    let expected_registered_paths = annotated_paths
        .union(&tray_commands)
        .cloned()
        .collect::<BTreeSet<_>>();
    let frontend_manager = frontend
        .difference(&tray_commands)
        .cloned()
        .collect::<BTreeSet<_>>();

    assert_eq!(annotated.len(), 53, "Manager domain command count changed");
    assert_eq!(
        lib_annotated, tray_commands,
        "lib.rs must own only the three tray commands"
    );
    assert_eq!(
        registered.len(),
        56,
        "handler must include 53 domain and three tray commands"
    );
    assert_eq!(
        registered_paths, expected_registered_paths,
        "generate_handler must contain exactly the annotated domain paths and tray commands",
    );
    assert_eq!(
        registered_manager, annotated_paths,
        "generate_handler must register every domain command exactly once",
    );
    assert_eq!(frontend.len(), 53, "frontend-known command count changed");
    assert!(frontend.is_superset(&tray_commands));
    assert_eq!(frontend_manager.len(), 50);
    assert!(
        annotated.is_superset(&frontend_manager),
        "every frontend manager command must have an annotated backend command"
    );

    let backend_only = annotated
        .difference(&frontend_manager)
        .cloned()
        .collect::<BTreeSet<_>>();
    assert_eq!(
        backend_only,
        BTreeSet::from([
            "backend_version".to_string(),
            "backfill_relay_profile_from_live".to_string(),
            "plugin_marketplace_status".to_string(),
        ])
    );
    assert!(actions.contains("command: \"launch_chatgpt_plus\" | \"restart_chatgpt_plus\""));
}

fn annotated_command_names(source: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut command_attribute = false;
    for line in source.lines() {
        let line = line.trim();
        if line == "#[tauri::command]" {
            command_attribute = true;
            continue;
        }
        if command_attribute
            && (line.starts_with("pub fn ")
                || line.starts_with("pub async fn ")
                || line.starts_with("fn "))
        {
            let signature = line
                .strip_prefix("pub async fn ")
                .or_else(|| line.strip_prefix("pub fn "))
                .or_else(|| line.strip_prefix("fn "))
                .expect("command signature");
            let name = signature.split('(').next().expect("command name");
            names.push(
                name.split('<')
                    .next()
                    .expect("command base name")
                    .to_string(),
            );
            command_attribute = false;
        }
    }
    names
}

fn quoted_string_array(source: &str, constant: &str) -> Vec<String> {
    let array = source
        .split(&format!("export const {constant} = ["))
        .nth(1)
        .expect("frontend command array")
        .split("] as const")
        .next()
        .expect("frontend command array end");
    array
        .lines()
        .filter_map(|line| line.trim().strip_prefix('"'))
        .filter_map(|line| line.strip_suffix("\","))
        .map(str::to_string)
        .collect()
}

#[test]
fn macos_packager_builds_one_visible_app_with_one_main_binary() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let packager = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("scripts/installer/macos/package-dmg.sh");
    let script = std::fs::read_to_string(&packager).expect("read macOS packager");

    assert!(script.contains("<key>LSUIElement</key>"));
    assert!(script.contains("ARCH=\"${2:-$(uname -m)}\""));
    assert!(script.contains("BINARY_DIR=\"${BINARY_DIR:-$ROOT/target/release}\""));
    assert!(script.contains("ChatGPTPlusPlus-${VERSION}-macos-${ARCH}.dmg"));
    assert!(script.contains("local app_name=\"ChatGPT++\""));
    assert!(script.contains("local binary_path=\"$BINARY_DIR/chatgpt-plus-plus-manager\""));
    assert!(!script.contains("local helper_path=\"$BINARY_DIR/chatgpt-plus-plus\""));
    assert!(!script.contains("$app_dir/Contents/Helpers/chatgpt-plus-plus"));
    assert!(script.contains("<false/>"));
    assert!(!script.contains("create_app \"ChatGPT++ 管理工具\""));
    assert!(!script.contains("$STAGE/ChatGPT++ 管理工具.app"));
}

#[test]
fn github_release_workflow_builds_separate_macos_x64_and_arm64_dmgs() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let workflow = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join(".github/workflows/release-assets.yml");
    let workflow = std::fs::read_to_string(&workflow).expect("read release assets workflow");

    assert!(workflow.contains("macos-15-intel"));
    assert!(workflow.contains("x86_64-apple-darwin"));
    assert!(workflow.contains("macos-14"));
    assert!(workflow.contains("aarch64-apple-darwin"));
    assert!(workflow.contains("package-dmg.sh \"$VERSION\" \"${{ matrix.arch }}\""));
    assert!(workflow.contains("target/${{ matrix.target }}/release"));
    assert!(workflow.contains(
        "zip -r \"../ChatGPTPlusPlus-${VERSION}-macos-${{ matrix.arch }}.zip\" \"ChatGPT++.app\""
    ));
    assert!(workflow.contains("test ! -e \"$app/Contents/Helpers/chatgpt-plus-plus\""));
    assert!(!workflow.contains("ChatGPT++ 管理工具.app"));
}

#[test]
fn github_release_workflow_uploads_static_latest_json() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let workflow = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join(".github/workflows/release-assets.yml");
    let workflow = std::fs::read_to_string(&workflow).expect("read release assets workflow");

    assert!(workflow.contains("latest-json:"));
    assert!(workflow.contains("latest.json"));
    assert!(workflow.contains("gh release upload \"$TAG\" latest.json --clobber"));
    assert!(workflow.contains("tags:\n      - \"v*\""));
    assert!(workflow.contains("create-release:"));
    assert!(workflow.contains("generate_release_notes: true"));
    assert!(workflow.contains("needs: create-release"));
    assert!(!workflow.contains("github.event.release.tag_name"));
}

#[test]
fn relay_settings_keeps_profile_config_and_auth_files_isolated() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/app/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let app_tsx = normalize_source_text(&app_tsx);
    let controller_ts = manifest_dir
        .parent()
        .unwrap()
        .join("src/features/relay-profiles/controller.ts");
    let controller_ts =
        std::fs::read_to_string(&controller_ts).expect("read Relay profile controller");
    let editor_ts = manifest_dir
        .parent()
        .unwrap()
        .join("src/features/relay-profiles/editor.ts");
    let editor_ts = std::fs::read_to_string(&editor_ts).expect("read Relay profile editor");
    let screen_tsx = manifest_dir
        .parent()
        .unwrap()
        .join("src/screens/relay-profiles/RelayProfilesScreen.tsx");
    let screen_tsx = std::fs::read_to_string(&screen_tsx).expect("read Relay profiles screen");
    let commands_rs = manifest_dir.join("src/commands/relay.rs");
    let commands_rs = std::fs::read_to_string(&commands_rs).expect("read manager relay commands");

    assert!(!app_tsx.contains("snapshotActiveRelayFilesBeforeSwitch"));
    assert!(!app_tsx.contains("previousActiveRelayId"));
    assert!(app_tsx.contains("targetRelayId"));
    assert!(app_tsx.contains("const validationError = relaySwitchIssue("));
    assert!(app_tsx.contains("selectedBeforeSave.id,\n    );"));
    assert!(controller_ts.contains("focus: { type: \"existing\", profileId },"));
    assert!(controller_ts.contains("}).semantic.switchIssue?.message ?? null"));
    assert!(!app_tsx.contains("relayProfileSwitchValidation"));
    assert!(editor_ts.contains("缺少独立 config.toml"));
    assert!(!app_tsx.contains("relayProfileSwitchCommand"));
    assert!(screen_tsx.contains("const openNewProfile = (mode: RelayProfileEditableMode) =>"));
    assert!(screen_tsx.contains("openNewProfile(\"aggregate\")"));
    assert!(screen_tsx.contains("已打开聚合供应商详情"));
    assert!(!commands_rs.contains("缺少独立 auth.json"));
    assert!(commands_rs.contains("backfill_relay_profile_from_live"));
    assert!(commands_rs.contains("codex_home_apply::activate"));
    assert!(commands_rs.contains("codex_home_apply::reconcile"));
    assert!(!commands_rs.contains("relay_config::apply_relay_profile_to_home"));
}

#[test]
fn manager_does_not_expose_extension_management() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/app/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let routes_ts = manifest_dir.parent().unwrap().join("src/app/routes.ts");
    let routes_ts = std::fs::read_to_string(&routes_ts).expect("read manager routes");
    let presentation_ts = manifest_dir
        .parent()
        .unwrap()
        .join("src/app/presentation.ts");
    let presentation_ts = std::fs::read_to_string(&presentation_ts).expect("read app presentation");
    let actions_ts = manifest_dir.parent().unwrap().join("src/app/actions.ts");
    let actions_ts = std::fs::read_to_string(&actions_ts).expect("read manager actions");
    let styles = manifest_dir.parent().unwrap().join("src/styles.css");
    let styles = std::fs::read_to_string(&styles).expect("read manager styles.css");

    for source in [&app_tsx, &routes_ts, &presentation_ts, &actions_ts] {
        assert!(!source.contains("工具与插件"));
        assert!(!source.contains("read_live_context_entries"));
        assert!(!source.contains("sync_live_context_entries"));
        assert!(!source.contains("upsert_context_entry"));
        assert!(!source.contains("delete_context_entry"));
    }
    assert!(!routes_ts.contains("\"context\""));
    assert!(!app_tsx.contains("ContextScreen"));
    assert!(!styles.contains(".relay-context-panel"));
    assert!(!styles.contains(".context-enabled-switch"));
}

#[test]
fn manager_window_and_relay_detail_header_stay_usable() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/app/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let detail_tsx = manifest_dir
        .parent()
        .unwrap()
        .join("src/features/relay-profiles/components/RelayProfileDetail.tsx");
    let detail_tsx = std::fs::read_to_string(&detail_tsx).expect("read Relay profile detail");
    let styles = manifest_dir.parent().unwrap().join("src/styles.css");
    let styles = std::fs::read_to_string(&styles).expect("read manager styles.css");
    let lib_rs =
        std::fs::read_to_string(manifest_dir.join("src/lib.rs")).expect("read manager lib.rs");
    let tauri_conf =
        std::fs::read_to_string(manifest_dir.join("tauri.conf.json")).expect("read tauri config");

    assert!(detail_tsx.contains("relay-detail-sticky"));
    assert!(!detail_tsx.contains("CardHead title=\"供应商详情\""));
    assert!(!app_tsx.contains("relay-detail-sticky"));
    assert!(styles.contains(".relay-detail-sticky"));
    assert!(styles.contains("position: sticky"));
    assert!(styles.contains("top: 0"));
    assert!(styles.contains("margin: 0"));
    assert!(lib_rs.contains(".inner_size(1180.0, 820.0)"));
    assert!(lib_rs.contains(".min_inner_size(960.0, 720.0)"));
    assert!(tauri_conf.contains("\"width\": 1180"));
    assert!(tauri_conf.contains("\"height\": 820"));
    assert!(tauri_conf.contains("\"minWidth\": 960"));
    assert!(tauri_conf.contains("\"minHeight\": 720"));
}

#[test]
fn relay_preview_deduplicates_root_keys_when_merging_common_config() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let config_ts = manifest_dir
        .parent()
        .unwrap()
        .join("src/features/relay-profiles/config.ts");
    let config_ts = std::fs::read_to_string(&config_ts).expect("read Relay config module");

    assert!(config_ts.contains("dedupeTomlRootLines"));
    assert!(config_ts.contains("rootSeen.add(key)"));
    assert!(config_ts.contains("joinTomlSectionsRootFirst"));
}

#[test]
fn provider_presets_include_runapi() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let presets = manifest_dir.parent().unwrap().join("src/presets.ts");
    let presets = std::fs::read_to_string(&presets).expect("read manager presets.ts");

    assert!(presets.contains("id: \"runapi\""));
    assert!(presets.contains("name: \"RunAPI\""));
    assert!(presets.contains("category: \"aggregator\""));
    assert!(presets.contains("baseUrl: \"https://runapi.co/v1\""));
}

#[test]
fn manager_no_longer_exposes_mobile_control() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/app/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");

    assert!(!app_tsx.contains("mobileControl"));
    assert!(!app_tsx.contains("手机控制"));
    assert!(!app_tsx.contains("mobileRelayServers"));
    assert!(!app_tsx.contains("MobileControlScreen"));
}

#[test]
fn manager_ui_no_longer_exposes_command_wrapper_or_startup_marketplace_prompt() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/app/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");

    assert!(!app_tsx.contains("启用 Codex 命令包装器"));
    assert!(!app_tsx.contains("修复后端"));
    assert!(!app_tsx.contains("repairBackend"));
    assert!(!app_tsx.contains("await checkPluginMarketplacePrompt()"));
}

#[test]
fn manager_update_install_keeps_visible_progress_bar() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/app/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let about_tsx = manifest_dir
        .parent()
        .unwrap()
        .join("src/screens/diagnostics/AboutScreen.tsx");
    let about_tsx = std::fs::read_to_string(&about_tsx).expect("read About screen");

    assert!(about_tsx.contains("下载并运行安装包"));
    assert!(app_tsx.contains("updateInstallProgress"));
    assert!(about_tsx.contains("安装包更新进度"));
    assert!(about_tsx.contains("completedTitle={t(\"上次更新结果\")}"));
    assert!(about_tsx.contains("progress={updateInstallProgress}"));
}
