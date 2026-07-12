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
fn manager_uses_single_instance_guard_before_starting_tauri() {
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");

    assert!(lib_rs.contains("acquire_single_instance_guard()"));
    assert!(lib_rs.contains("manager_guard_port"));
    assert!(lib_rs.contains("manager.already_running"));
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
fn explicit_quit_requests_internal_helper_shutdown_but_window_close_does_not() {
    let lib_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read manager lib.rs");
    let launcher = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("chatgpt-plus-launcher/src/main.rs"),
    )
    .expect("read launcher main.rs");

    assert!(lib_rs.contains("request_enhanced_shutdown()"));
    assert!(lib_rs.contains("WindowEvent::CloseRequested"));
    assert!(!lib_rs.contains(
        "WindowEvent::CloseRequested { api, .. } => {\n            request_enhanced_shutdown"
    ));
    assert!(launcher.contains("wait_for_enhanced_shutdown_request()"));
    assert!(launcher.contains("handle.shutdown_owned_resources().await"));
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
fn launcher_binary_embeds_codex_icon_resource() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let launcher_build = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("chatgpt-plus-launcher/build.rs");
    let build_rs = std::fs::read_to_string(&launcher_build).expect("read launcher build.rs");

    assert!(build_rs.contains("WindowsResource"));
    assert!(build_rs.contains("icons/icon.ico"));
}

#[test]
fn windows_binaries_request_administrator_privileges() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let manager_build =
        std::fs::read_to_string(manifest_dir.join("build.rs")).expect("read manager build.rs");
    let windows_manifest = std::fs::read_to_string(manifest_dir.join("windows-app-manifest.xml"))
        .expect("read windows app manifest");
    let launcher_build = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("chatgpt-plus-launcher/build.rs");
    let launcher_build = std::fs::read_to_string(&launcher_build).expect("read launcher build.rs");
    let windows_installer = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("scripts/installer/windows/ChatGPTPlusPlus.nsi");
    let windows_installer =
        std::fs::read_to_string(&windows_installer).expect("read windows installer");

    assert!(manager_build.contains("windows-app-manifest.xml"));
    assert!(launcher_build.contains("windows-app-manifest.xml"));
    assert!(windows_manifest.contains("requireAdministrator"));
    assert!(windows_manifest.contains("Microsoft.Windows.Common-Controls"));
    assert!(windows_installer.contains("RequestExecutionLevel admin"));
}

#[test]
fn windows_entrypoints_register_chatgptplusplus_url_protocol() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let windows_install = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("crates/chatgpt-plus-core/src/install/windows.rs");
    let windows_install =
        std::fs::read_to_string(&windows_install).expect("read windows install source");

    assert!(windows_install.contains("Software\\Classes\\chatgptplusplus"));
    assert!(windows_install.contains("Software\\Classes\\codexplusplus"));
    assert!(windows_install.contains("URL Protocol"));
    assert!(windows_install.contains("%1"));
}

#[test]
fn manager_launch_button_uses_the_deep_enhanced_launch_interface() {
    let commands_rs = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/commands/settings.rs"
    ))
    .expect("read manager settings commands");

    assert!(commands_rs.contains("start_enhanced_codex(action, launch_request)"));
    assert!(!commands_rs.contains("std::process::Command::new"));
    assert!(!commands_rs.contains("companion_binary_path"));
    assert!(!commands_rs.contains("launch_and_inject_with_hooks(options"));
}

#[test]
fn manager_does_not_register_the_removed_remote_project_commands() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let commands_rs = [
        "commands.rs",
        "commands/shared.rs",
        "commands/sessions.rs",
        "commands/install.rs",
        "commands/context.rs",
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

    assert_eq!(handler.matches("commands::").count(), 61);
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
        "context.rs",
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

    assert_eq!(annotated.len(), 61, "Manager domain command count changed");
    assert_eq!(
        lib_annotated, tray_commands,
        "lib.rs must own only the three tray commands"
    );
    assert_eq!(
        registered.len(),
        64,
        "handler must include 61 domain and three tray commands"
    );
    assert_eq!(
        registered_paths, expected_registered_paths,
        "generate_handler must contain exactly the annotated domain paths and tray commands",
    );
    assert_eq!(
        registered_manager, annotated_paths,
        "generate_handler must register every domain command exactly once",
    );
    assert_eq!(frontend.len(), 60, "frontend-known command count changed");
    assert!(frontend.is_superset(&tray_commands));
    assert_eq!(frontend_manager.len(), 57);
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
            "list_context_entries".to_string(),
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
fn macos_packager_builds_one_visible_app_with_an_embedded_launcher_helper() {
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
    assert!(script.contains("local helper_path=\"$BINARY_DIR/chatgpt-plus-plus\""));
    assert!(script.contains("$app_dir/Contents/Helpers/chatgpt-plus-plus"));
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
    assert!(workflow.contains("$app/Contents/Helpers/chatgpt-plus-plus"));
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
}

#[test]
fn relay_settings_keeps_profile_config_and_auth_files_isolated() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/app/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
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
fn relay_context_management_is_global_not_supplier_scoped() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let app_tsx = manifest_dir.parent().unwrap().join("src/app/App.tsx");
    let app_tsx = std::fs::read_to_string(&app_tsx).expect("read manager App.tsx");
    let screen_tsx = manifest_dir
        .parent()
        .unwrap()
        .join("src/screens/context/ContextScreen.tsx");
    let screen_tsx = std::fs::read_to_string(&screen_tsx).expect("read Context screen");
    let config_ts = manifest_dir
        .parent()
        .unwrap()
        .join("src/features/context/config.ts");
    let config_ts = std::fs::read_to_string(&config_ts).expect("read Context config module");
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

    assert!(screen_tsx.contains("作为全局配置独立管理"));
    assert!(
        presentation_ts.contains("label: t(\"工具与插件\")")
            || presentation_ts.contains("label: \"工具与插件\"")
    );
    assert!(
        screen_tsx.contains("title={t(\"Codex 工具与插件\")}")
            || screen_tsx.contains("title=\"Codex 工具与插件\"")
    );
    assert!(!screen_tsx.contains("label: \"上下文配置\""));
    assert!(!screen_tsx.contains("title=\"上下文配置\""));
    assert!(!screen_tsx.contains("<strong>Codex 上下文</strong>"));
    assert!(routes_ts.contains("\"context\""));
    assert!(screen_tsx.contains("export function ContextScreen"));
    assert!(app_tsx.contains("route === \"context\""));
    assert!(app_tsx.contains("if (next === \"context\")"));
    assert!(config_ts.contains("selectedContextConfigToml(entries)"));
    assert!(screen_tsx.contains("{ type: \"toggle\", entry }"));
    assert!(config_ts.contains("export function projectRelayFiles"));
    assert!(actions_ts.contains("read_live_context_entries"));
    assert!(actions_ts.contains("sync_live_context_entries"));
    assert!(app_tsx.contains("refreshLiveContextEntries"));
    assert!(app_tsx.contains("syncLive: requestContextLiveSync"));
    assert!(config_ts.contains("function mergeStoredAndLiveContextEntries"));
    assert!(config_ts.contains("function mergeStoredAndLiveContextEntryList"));
    assert!(screen_tsx.contains("contextEnabledSwitch"));
    assert!(!screen_tsx.contains("entry.enabled ? \"已启用\" : \"已禁用\""));
    assert!(!screen_tsx.contains("空配置体"));
    assert!(screen_tsx.contains("relay-context-delete"));
    assert!(!screen_tsx.contains("切换供应商时只合并勾选项"));
    assert!(!screen_tsx.contains("未勾选的条目不会写入"));
    assert!(!screen_tsx.contains("className=\"context-switch\""));
    assert!(!styles.contains(".context-switch {"));
    assert!(styles.contains(".context-enabled-switch"));
    assert!(styles.contains(".context-switch-track"));
    assert!(styles.contains(".context-switch-thumb"));
    assert!(!styles.contains(".relay-context-row code"));
    assert!(styles.contains(".relay-context-delete"));
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
        .join("src/features/context/config.ts");
    let config_ts = std::fs::read_to_string(&config_ts).expect("read Context config module");

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
