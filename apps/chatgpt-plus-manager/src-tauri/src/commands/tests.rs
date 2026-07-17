use std::path::Path;

use chatgpt_plus_core::codex_home_apply::CodexHomeReconcileIntent;
use chatgpt_plus_core::settings::{
    BackendSettings, RelayMode, RelayProfile, SettingsStore, normalize_settings_before_save,
};
use chatgpt_plus_data::ProviderSyncStatus;
use rusqlite::Connection;
use serde_json::json;

use super::diagnostics::check_env_conflicts;
use super::install::{self, ads_payload, open_external_url, perform_update};
use super::relay::*;
use super::sessions::{self, delete_local_session, list_local_sessions};
use super::settings::{
    backend_version, launch_enhancement_changed, load_overview, should_show_update, startup_options,
};

#[test]
fn local_sessions_payload_serializes_with_camel_case_paths() {
    let payload = sessions::LocalSessionsPayload {
        db_path: "/tmp/state.sqlite".to_string(),
        db_paths: vec!["/tmp/state.sqlite".to_string()],
        sessions: Vec::new(),
    };

    let serialized = serde_json::to_value(payload).unwrap();

    assert_eq!(serialized["dbPath"], "/tmp/state.sqlite");
    assert_eq!(serialized["dbPaths"], json!(["/tmp/state.sqlite"]));
    assert!(serialized.get("db_path").is_none());
    assert!(serialized.get("db_paths").is_none());
}

#[test]
fn relay_switch_request_contract_names_the_target_and_not_the_previous_profile() {
    let request = RelayProfileSwitchRequest {
        settings: BackendSettings::default(),
        target_relay_id: "relay-b".to_string(),
    };

    assert_eq!(request.target_relay_id, "relay-b");
}

#[tokio::test]
async fn switching_relay_profile_syncs_history_to_the_new_provider() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(home.join("sessions/2026")).unwrap();
    std::fs::write(
        home.join("config.toml"),
        r#"model_provider = "custom"

[model_providers.custom]
name = "custom"
base_url = "https://relay.example/v1"
wire_api = "responses"
requires_openai_auth = true
"#,
    )
    .unwrap();
    std::fs::write(home.join("auth.json"), r#"{"OPENAI_API_KEY":"sk-old"}"#).unwrap();
    let rollout = home.join("sessions/2026/rollout-thread-1.jsonl");
    std::fs::write(
        &rollout,
        concat!(
            r#"{"type":"session_meta","payload":{"id":"thread-1","model_provider":"custom","cwd":"/workspace"}}"#,
            "\n",
            r#"{"type":"event_msg","payload":{"type":"user_message"}}"#,
            "\n"
        ),
    )
    .unwrap();
    let db_path = home.join("state_5.sqlite");
    let db = Connection::open(&db_path).unwrap();
    db.execute(
        "CREATE TABLE threads (id TEXT PRIMARY KEY, model_provider TEXT, archived INTEGER, has_user_event INTEGER, cwd TEXT)",
        [],
    )
    .unwrap();
    db.execute(
        "INSERT INTO threads VALUES ('thread-1', 'custom', 0, 1, '/workspace')",
        [],
    )
    .unwrap();
    drop(db);

    let pure_api = RelayProfile {
        id: "api".to_string(),
        name: "API".to_string(),
        relay_mode: RelayMode::PureApi,
        config_contents: std::fs::read_to_string(home.join("config.toml")).unwrap(),
        auth_contents: std::fs::read_to_string(home.join("auth.json")).unwrap(),
        ..RelayProfile::default()
    };
    let official = RelayProfile {
        id: "official".to_string(),
        name: "Official".to_string(),
        relay_mode: RelayMode::Official,
        auth_contents: r#"{"auth_mode":"chatgpt","tokens":{"access_token":"official"}}"#
            .to_string(),
        ..RelayProfile::default()
    };
    let original = BackendSettings {
        active_relay_id: pure_api.id.clone(),
        relay_profiles: vec![pure_api.clone(), official.clone()],
        ..BackendSettings::default()
    };
    let store = SettingsStore::new(temp.path().join("settings.json"));
    store.save(&original).unwrap();
    let requested = BackendSettings {
        active_relay_id: official.id.clone(),
        relay_profiles: vec![pure_api, official],
        ..BackendSettings::default()
    };

    let outcome = activate_relay_profile_with_history_sync(&store, &home, requested, "official")
        .await
        .unwrap();

    assert_eq!(outcome.activation.settings.active_relay_id, "official");
    let history_sync = outcome.history_sync.as_ref().unwrap();
    assert_eq!(history_sync.status, ProviderSyncStatus::Synced);
    assert_eq!(history_sync.target_provider, "openai");
    let session_meta: serde_json::Value = serde_json::from_str(
        std::fs::read_to_string(&rollout)
            .unwrap()
            .lines()
            .next()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(session_meta["payload"]["model_provider"], "openai");
    let db = Connection::open(db_path).unwrap();
    let provider: String = db
        .query_row(
            "SELECT model_provider FROM threads WHERE id = 'thread-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(provider, "openai");
}

#[tokio::test]
async fn switching_profiles_with_the_same_provider_skips_history_sync() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir(&home).unwrap();
    std::fs::write(home.join("config.toml"), "model = \"gpt-5\"\n").unwrap();
    std::fs::write(
        home.join("auth.json"),
        r#"{"auth_mode":"chatgpt","tokens":{"access_token":"official-a"}}"#,
    )
    .unwrap();
    let official_a = RelayProfile {
        id: "official-a".to_string(),
        name: "Official A".to_string(),
        relay_mode: RelayMode::Official,
        auth_contents: r#"{"auth_mode":"chatgpt","tokens":{"access_token":"official-a"}}"#
            .to_string(),
        ..RelayProfile::default()
    };
    let official_b = RelayProfile {
        id: "official-b".to_string(),
        name: "Official B".to_string(),
        relay_mode: RelayMode::Official,
        auth_contents: r#"{"auth_mode":"chatgpt","tokens":{"access_token":"official-b"}}"#
            .to_string(),
        ..RelayProfile::default()
    };
    let original = BackendSettings {
        active_relay_id: official_a.id.clone(),
        relay_profiles: vec![official_a.clone(), official_b.clone()],
        ..BackendSettings::default()
    };
    let store = SettingsStore::new(temp.path().join("settings.json"));
    store.save(&original).unwrap();
    let requested = BackendSettings {
        active_relay_id: official_b.id.clone(),
        relay_profiles: vec![official_a, official_b],
        ..BackendSettings::default()
    };

    let outcome = activate_relay_profile_with_history_sync(&store, &home, requested, "official-b")
        .await
        .unwrap();

    assert_eq!(outcome.activation.settings.active_relay_id, "official-b");
    assert!(outcome.history_sync.is_none());
}

#[tokio::test]
async fn switching_provider_succeeds_when_history_sync_is_temporarily_locked() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join(".codex");
    std::fs::create_dir_all(home.join("tmp/provider-sync.lock")).unwrap();
    std::fs::write(
        home.join("config.toml"),
        concat!(
            "model_provider = \"custom\"\n\n",
            "[model_providers.custom]\n",
            "name = \"custom\"\n",
            "base_url = \"https://relay.example/v1\"\n",
            "wire_api = \"responses\"\n",
            "requires_openai_auth = true\n"
        ),
    )
    .unwrap();
    std::fs::write(home.join("auth.json"), r#"{"OPENAI_API_KEY":"sk-old"}"#).unwrap();
    let pure_api = RelayProfile {
        id: "api".to_string(),
        name: "API".to_string(),
        relay_mode: RelayMode::PureApi,
        config_contents: std::fs::read_to_string(home.join("config.toml")).unwrap(),
        auth_contents: std::fs::read_to_string(home.join("auth.json")).unwrap(),
        ..RelayProfile::default()
    };
    let official = RelayProfile {
        id: "official".to_string(),
        name: "Official".to_string(),
        relay_mode: RelayMode::Official,
        auth_contents: r#"{"auth_mode":"chatgpt","tokens":{"access_token":"official"}}"#
            .to_string(),
        ..RelayProfile::default()
    };
    let original = BackendSettings {
        active_relay_id: pure_api.id.clone(),
        relay_profiles: vec![pure_api.clone(), official.clone()],
        ..BackendSettings::default()
    };
    let store = SettingsStore::new(temp.path().join("settings.json"));
    store.save(&original).unwrap();
    let requested = BackendSettings {
        active_relay_id: official.id.clone(),
        relay_profiles: vec![pure_api, official],
        ..BackendSettings::default()
    };

    let outcome = activate_relay_profile_with_history_sync(&store, &home, requested, "official")
        .await
        .unwrap();

    assert_eq!(outcome.activation.settings.active_relay_id, "official");
    let history_sync = outcome.history_sync.unwrap();
    assert_eq!(history_sync.status, ProviderSyncStatus::Skipped);
    assert!(history_sync.message.contains("provider-sync.lock"));
    assert_eq!(chatgpt_plus_data::current_provider(Some(&home)), "openai");
}

#[test]
fn manager_relay_callers_use_the_deep_module_seams() {
    let commands_source = include_str!("relay.rs");
    let aggregate_helper = ["apply_aggregate_relay_", "injection_to_home"].concat();
    let complete_files_precheck = ["relay_has_complete_", "files"].concat();
    let legacy_switch = ["relay_switch::", "switch_relay_profile_in_home"].concat();
    let legacy_clear = ["relay_config::clear_", "relay_config_to_home"].concat();
    assert!(!commands_source.contains(&aggregate_helper));
    assert!(!commands_source.contains(&complete_files_precheck));
    assert!(!commands_source.contains(&legacy_switch));
    assert!(!commands_source.contains(&legacy_clear));
    assert!(commands_source.contains("codex_home_apply::reconcile"));
    assert!(commands_source.contains("codex_home_apply::activate"));
    let explicit_clear_intent = ["CodexHomeReconcileIntent::", "ClearManagedRelay"].concat();
    assert!(commands_source.contains(&explicit_clear_intent));

    let clear_adapter = commands_source
        .split("fn clear_relay_injection_in_home(")
        .nth(1)
        .unwrap()
        .split("fn log_relay_apply_request(")
        .next()
        .unwrap();
    let synthetic_profile_id = ["manager-official", "-clear"].concat();
    let local_auth_decision = ["official", "_auth"].concat();
    let relay_mode_branch = ["Relay", "Mode::"].concat();
    let synthetic_profile = ["Relay", "Profile {"].concat();
    assert!(!clear_adapter.contains(&synthetic_profile_id));
    assert!(!clear_adapter.contains(&local_auth_decision));
    assert!(!clear_adapter.contains(&relay_mode_branch));
    assert!(!clear_adapter.contains(&synthetic_profile));

    let app_source = include_str!("../../../src/app/App.tsx");
    let snapshot_roundtrip = ["snapshotActiveRelayFiles", "BeforeSwitch"].concat();
    let previous_argument = ["previousActiveRelay", "Id"].concat();
    assert!(!app_source.contains(&snapshot_roundtrip));
    assert!(!app_source.contains(&previous_argument));
    assert!(app_source.contains("targetRelayId"));
}

#[test]
fn backend_version_returns_structured_payload() {
    let result = backend_version();

    assert_eq!(result.status, "ok");
    assert!(!result.payload.version.is_empty());
}

#[test]
fn startup_options_returns_structured_payload() {
    let result = startup_options();

    assert_eq!(result.status, "ok");
}

#[test]
fn launch_enhancement_changes_require_a_managed_codex_restart() {
    let previous = BackendSettings::default();
    let fast_startup = BackendSettings {
        codex_app_fast_startup: true,
        ..previous.clone()
    };
    let computer_use_guard = BackendSettings {
        computer_use_guard_enabled: true,
        ..previous.clone()
    };
    let unrelated = BackendSettings {
        diagnostic_log_enabled: false,
        ..previous.clone()
    };

    assert!(launch_enhancement_changed(&previous, &fast_startup));
    assert!(launch_enhancement_changed(&previous, &computer_use_guard));
    assert!(!launch_enhancement_changed(&previous, &unrelated));
}

#[test]
fn startup_options_honors_show_update_environment() {
    unsafe {
        std::env::set_var("CHATGPT_PLUS_SHOW_UPDATE", "1");
    }

    let result = startup_options();

    unsafe {
        std::env::remove_var("CHATGPT_PLUS_SHOW_UPDATE");
    }

    assert_eq!(result.status, "ok");
    assert!(result.payload.show_update);
}

#[test]
fn startup_options_honors_show_update_argument() {
    assert!(should_show_update(
        ["chatgpt-plus-plus-manager.exe", "--show-update"],
        None
    ));
}

#[test]
fn overview_contains_expected_operational_fields() {
    let result = tauri::async_runtime::block_on(load_overview());

    assert_eq!(result.status, "ok");
    assert!(!result.payload.current_version.is_empty());
    assert!(
        result.payload.codex_version.is_none()
            || result
                .payload
                .codex_version
                .as_deref()
                .is_some_and(|version| !version.is_empty())
    );
    assert!(matches!(
        result.payload.codex_app.status.as_str(),
        "found" | "missing"
    ));
    assert!(matches!(
        result.payload.app_shortcut.status.as_str(),
        "installed" | "missing"
    ));
}

#[test]
fn update_install_requires_release_payload() {
    let result = tauri::async_runtime::block_on(perform_update(None));

    assert_eq!(result.status, "failed");
    assert!(result.message.contains("请先检查更新"));
}

#[test]
fn relay_payload_does_not_expose_token_text() {
    let payload = relay_payload(
        chatgpt_plus_core::relay_config::RelayStatus {
            authenticated: true,
            auth_source: "registry.json".to_string(),
            account_label: Some("user@example.test".to_string()),
            config_path: "config.toml".to_string(),
            configured: true,
            requires_openai_auth: true,
            has_bearer_token: true,
        },
        None,
    );
    let text = serde_json::to_string(&payload).unwrap();

    assert!(!text.contains("sk-"));
    assert!(text.contains("hasBearerToken"));
}

#[test]
fn aggregate_relay_injection_writes_local_proxy_without_chatgpt_auth() {
    let temp = tempfile::tempdir().unwrap();
    let settings = BackendSettings {
        relay_profiles: vec![RelayProfile {
            id: "aggregate".to_string(),
            name: "Aggregate".to_string(),
            relay_mode: chatgpt_plus_core::settings::RelayMode::Aggregate,
            ..RelayProfile::default()
        }],
        active_relay_id: "aggregate".to_string(),
        aggregate_relay_profiles: vec![chatgpt_plus_core::settings::AggregateRelayProfile {
            id: "aggregate".to_string(),
            name: "Aggregate".to_string(),
            strategy: chatgpt_plus_core::settings::AggregateRelayStrategy::Failover,
            members: Vec::new(),
        }],
        active_aggregate_relay_id: "aggregate".to_string(),
        ..BackendSettings::default()
    };

    let result = reconcile_relay_injection_in_home(
        "test.aggregate_relay_injection",
        temp.path(),
        &settings,
        "ok",
        "failed",
    );
    let config = std::fs::read_to_string(temp.path().join("config.toml")).unwrap();

    assert_eq!(result.status, "ok");
    assert!(result.payload.configured);
    assert!(!result.payload.authenticated);
    assert!(config.contains(r#"base_url = "http://127.0.0.1:57321/v1""#));
    assert!(config.contains(r#"experimental_bearer_token = "chatgpt-plus-aggregate""#));
}

#[test]
fn relay_files_payload_reads_config_and_auth_contents() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(
        temp.path().join("config.toml"),
        "model_provider = \"custom\"\n",
    )
    .unwrap();
    std::fs::write(
        temp.path().join("auth.json"),
        "{\"OPENAI_API_KEY\":\"sk-test\"}\n",
    )
    .unwrap();

    let payload = relay_files_payload_from_home(temp.path()).unwrap();

    assert!(payload.config_path.ends_with("config.toml"));
    assert!(payload.auth_path.ends_with("auth.json"));
    assert_eq!(payload.config_contents, "model_provider = \"custom\"\n");
    assert_eq!(payload.auth_contents, "{\"OPENAI_API_KEY\":\"sk-test\"}\n");
}

#[test]
fn env_conflict_commands_ignore_codex_home_and_remove_openai_vars() {
    let test_openai_name = "OPENAI_CHATGPT_PLUS_ENV_CONFLICT_TEST";
    let previous_openai = std::env::var_os(test_openai_name);
    let previous_codex_home = std::env::var_os("CODEX_HOME");
    let temp = tempfile::tempdir().unwrap();
    unsafe {
        std::env::set_var(test_openai_name, "sk-test");
        std::env::set_var("CODEX_HOME", temp.path());
    }

    let check = check_env_conflicts();
    assert_eq!(check.status, "ok");
    assert!(
        check
            .payload
            .conflicts
            .iter()
            .any(|item| item.name == test_openai_name)
    );
    assert!(
        !check
            .payload
            .conflicts
            .iter()
            .any(|item| item.name == "CODEX_HOME")
    );

    chatgpt_plus_core::env_conflicts::remove_process_env_conflicts_for_tests(
        &[test_openai_name.to_string(), "CODEX_HOME".to_string()],
        chatgpt_plus_core::paths::default_app_state_dir().join("test-backups"),
    )
    .unwrap();
    assert!(std::env::var_os(test_openai_name).is_none());
    assert_eq!(
        std::env::var_os("CODEX_HOME"),
        Some(temp.path().as_os_str().to_os_string())
    );

    unsafe {
        match previous_openai {
            Some(value) => std::env::set_var(test_openai_name, value),
            None => std::env::remove_var(test_openai_name),
        }
        match previous_codex_home {
            Some(value) => std::env::set_var("CODEX_HOME", value),
            None => std::env::remove_var("CODEX_HOME"),
        }
    }
}

#[test]
fn delete_local_session_falls_back_when_requested_db_no_longer_contains_thread() {
    let temp = tempfile::tempdir().unwrap();
    let previous_codex_home = std::env::var_os("CODEX_HOME");
    let codex_home = temp.path().join("codex-home");
    let sqlite_dir = codex_home.join("sqlite");
    std::fs::create_dir_all(&sqlite_dir).unwrap();
    let stale_db = sqlite_dir.join("codex-dev.db");
    let active_db = sqlite_dir.join("state_5.sqlite");
    let rollout_path = temp.path().join("rollout.jsonl");
    std::fs::write(&rollout_path, "{\"type\":\"message\"}\n").unwrap();
    let stale = rusqlite::Connection::open(&stale_db).unwrap();
    stale
        .execute(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, title TEXT)",
            [],
        )
        .unwrap();
    drop(stale);
    let active = rusqlite::Connection::open(&active_db).unwrap();
    active
        .execute(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, title TEXT)",
            [],
        )
        .unwrap();
    active
        .execute(
            "INSERT INTO threads VALUES ('t1', ?1, 'Active Thread')",
            [rollout_path.to_string_lossy().to_string()],
        )
        .unwrap();
    drop(active);

    unsafe {
        std::env::set_var("CODEX_HOME", &codex_home);
    }
    let result = delete_local_session(sessions::DeleteLocalSessionRequest {
        session_id: "t1".to_string(),
        title: "Active Thread".to_string(),
        db_path: Some(stale_db.to_string_lossy().to_string()),
    });
    unsafe {
        if let Some(value) = previous_codex_home {
            std::env::set_var("CODEX_HOME", value);
        } else {
            std::env::remove_var("CODEX_HOME");
        }
    }

    assert_eq!(result.status, "ok");
    assert_eq!(
        result.payload.status,
        chatgpt_plus_core::models::DeleteStatus::LocalDeleted
    );
    let active = rusqlite::Connection::open(&active_db).unwrap();
    assert_eq!(
        active
            .query_row("SELECT COUNT(*) FROM threads WHERE id = 't1'", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap(),
        0
    );
}

#[test]
fn list_local_sessions_deduplicates_threads_across_current_and_legacy_dbs() {
    let temp = tempfile::tempdir().unwrap();
    let previous_codex_home = std::env::var_os("CODEX_HOME");
    let codex_home = temp.path().join("codex-home");
    let sqlite_dir = codex_home.join("sqlite");
    std::fs::create_dir_all(&sqlite_dir).unwrap();
    let current_db = sqlite_dir.join("state_5.sqlite");
    let legacy_db = codex_home.join("state_5.sqlite");
    create_minimal_thread_db(&current_db, "t1", "Current Copy", 100);
    create_minimal_thread_db(&legacy_db, "t1", "Legacy Copy", 200);

    unsafe {
        std::env::set_var("CODEX_HOME", &codex_home);
    }
    let result = list_local_sessions();
    restore_codex_home(previous_codex_home);

    assert_eq!(result.status, "ok");
    assert_eq!(result.payload.sessions.len(), 1);
    assert_eq!(result.payload.sessions[0].id, "t1");
    assert_eq!(result.payload.sessions[0].title, "Legacy Copy");
    assert_eq!(
        result.payload.sessions[0].db_path,
        legacy_db.to_string_lossy()
    );
}

#[test]
fn delete_local_session_removes_duplicate_threads_from_all_candidate_dbs() {
    let temp = tempfile::tempdir().unwrap();
    let previous_codex_home = std::env::var_os("CODEX_HOME");
    let codex_home = temp.path().join("codex-home");
    let sqlite_dir = codex_home.join("sqlite");
    std::fs::create_dir_all(&sqlite_dir).unwrap();
    let current_db = sqlite_dir.join("state_5.sqlite");
    let legacy_db = codex_home.join("state_5.sqlite");
    create_minimal_thread_db(&current_db, "t1", "Current Copy", 100);
    create_minimal_thread_db(&legacy_db, "t1", "Legacy Copy", 200);

    unsafe {
        std::env::set_var("CODEX_HOME", &codex_home);
    }
    let result = delete_local_session(sessions::DeleteLocalSessionRequest {
        session_id: "t1".to_string(),
        title: "Legacy Copy".to_string(),
        db_path: Some(legacy_db.to_string_lossy().to_string()),
    });
    restore_codex_home(previous_codex_home);

    assert_eq!(result.status, "ok");
    assert_eq!(thread_count(&current_db, "t1"), 0);
    assert_eq!(thread_count(&legacy_db, "t1"), 0);
}

#[test]
fn session_export_command_prepares_and_saves_markdown_with_explicit_states() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex-home");
    std::fs::create_dir_all(&home).unwrap();
    let db_path = home.join("state_5.sqlite");
    let rollout_path = home.join("rollout.jsonl");
    std::fs::write(
        &rollout_path,
        "{\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"Hello\"}]}}\n",
    )
    .unwrap();
    create_thread_db_with_rollout(&db_path, &rollout_path);

    let prepared = sessions::export_local_session_markdown_from_home(
        &home,
        sessions::ExportLocalSessionRequest {
            session_id: "t1".to_string(),
            title: "Thread".to_string(),
            db_path: Some(db_path.to_string_lossy().to_string()),
            destination_path: None,
        },
    );
    assert_eq!(prepared.status, "ok");
    assert!(
        prepared
            .payload
            .markdown
            .as_deref()
            .unwrap()
            .contains("Hello")
    );

    let destination = temp.path().join("exports").join("thread.md");
    let saved = sessions::export_local_session_markdown_from_home(
        &home,
        sessions::ExportLocalSessionRequest {
            session_id: "t1".to_string(),
            title: "Thread".to_string(),
            db_path: Some(db_path.to_string_lossy().to_string()),
            destination_path: Some(destination.to_string_lossy().to_string()),
        },
    );
    assert_eq!(saved.status, "ok");
    assert!(saved.message.contains("Markdown 已保存到"));
    assert!(
        std::fs::read_to_string(destination)
            .unwrap()
            .contains("Hello")
    );
}

#[test]
fn session_usage_command_returns_rollout_token_history() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex-home");
    std::fs::create_dir_all(&home).unwrap();
    let db_path = home.join("state_5.sqlite");
    let rollout_path = home.join("rollout.jsonl");
    std::fs::write(
        &rollout_path,
        concat!(
            "{\"type\":\"turn_context\",\"payload\":{\"turn_id\":\"turn-1\"}}\n",
            "{\"timestamp\":\"2026-07-12T00:00:00Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":1500},\"last_token_usage\":{\"input_tokens\":1000,\"output_tokens\":200,\"total_tokens\":1200},\"model_context_window\":200000}}}\n"
        ),
    )
    .unwrap();
    create_thread_db_with_rollout(&db_path, &rollout_path);

    let result = sessions::load_local_session_usage_from_home(
        &home,
        sessions::LocalSessionUsageRequest {
            session_id: "t1".to_string(),
            title: "Thread".to_string(),
            db_path: Some(db_path.to_string_lossy().to_string()),
        },
    );

    assert_eq!(result.status, "ok");
    assert_eq!(result.payload["history"][0]["turnId"], "turn-1");
    assert_eq!(result.payload["history"][0]["usage"]["totalTokens"], 1200);
}

#[test]
fn plugin_marketplace_commands_register_inventory_and_mutate_plugins() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let source = temp.path().join("personal-market");
    std::fs::create_dir_all(source.join(".agents").join("plugins")).unwrap();
    std::fs::create_dir_all(source.join("plugins").join("demo")).unwrap();
    std::fs::write(
        source
            .join(".agents")
            .join("plugins")
            .join("marketplace.json"),
        r#"{"name":"personal","plugins":[{"name":"demo","description":"Demo plugin"}]}"#,
    )
    .unwrap();

    chatgpt_plus_core::plugin_marketplace::register_local_plugin_marketplace(
        &home, "personal", &source,
    )
    .unwrap();
    let registered = install::plugin_marketplace_inventory_from_home(&home);
    assert_eq!(registered.status, "ok");
    assert_eq!(registered.payload.plugins[0].id, "demo@personal");
    assert!(!registered.payload.plugins[0].installed);

    let installed = install::mutate_plugin_in_home(
        &home,
        install::PluginMutationRequest {
            plugin_id: "demo@personal".to_string(),
            action: "install".to_string(),
        },
    );
    assert_eq!(installed.status, "ok");
    assert!(installed.payload.plugins[0].installed);
    assert!(installed.payload.plugins[0].enabled);
}

#[tokio::test]
async fn plugin_marketplace_command_rejects_non_http_urls() {
    let temp = tempfile::tempdir().unwrap();
    let result = install::register_plugin_marketplace_in_home(
        &temp.path().join("home"),
        install::RegisterPluginMarketplaceRequest {
            url: "file:///tmp/personal-market".to_string(),
        },
    )
    .await;

    assert_eq!(result.status, "failed");
    assert!(result.message.contains("http"));
}

fn create_thread_db_with_rollout(path: &Path, rollout_path: &Path) {
    let db = rusqlite::Connection::open(path).unwrap();
    db.execute(
        "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, title TEXT)",
        [],
    )
    .unwrap();
    db.execute(
        "INSERT INTO threads VALUES ('t1', ?1, 'Thread')",
        [rollout_path.to_string_lossy().to_string()],
    )
    .unwrap();
}

fn create_minimal_thread_db(path: &Path, id: &str, title: &str, updated_at_ms: i64) {
    let db = rusqlite::Connection::open(path).unwrap();
    db.execute(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, title TEXT, updated_at_ms INTEGER)",
            [],
        )
        .unwrap();
    db.execute(
        "INSERT INTO threads VALUES (?1, '', ?2, ?3)",
        (id, title, updated_at_ms),
    )
    .unwrap();
}

fn thread_count(path: &Path, id: &str) -> i64 {
    let db = rusqlite::Connection::open(path).unwrap();
    db.query_row("SELECT COUNT(*) FROM threads WHERE id = ?1", [id], |row| {
        row.get::<_, i64>(0)
    })
    .unwrap()
}

fn restore_codex_home(previous: Option<std::ffi::OsString>) {
    unsafe {
        if let Some(value) = previous {
            std::env::set_var("CODEX_HOME", value);
        } else {
            std::env::remove_var("CODEX_HOME");
        }
    }
}

#[test]
fn reconcile_preserves_custom_provider_id() {
    let temp = tempfile::tempdir().unwrap();
    let profile = RelayProfile {
            relay_mode: chatgpt_plus_core::settings::RelayMode::PureApi,
            protocol: chatgpt_plus_core::settings::RelayProtocol::Responses,
            config_contents: "model_provider = \"ai\"\nmodel = \"gpt-image-2\"\n\n[model_providers.ai]\nname = \"ai\"\nwire_api = \"responses\"\nrequires_openai_auth = true\nbase_url = \"https://ahg.codes\"\n"
                .to_string(),
            auth_contents: r#"{"OPENAI_API_KEY":"sk-test"}"#.to_string(),
            ..RelayProfile::default()
        };
    let settings = BackendSettings {
        relay_profiles: vec![profile],
        ..BackendSettings::default()
    };

    chatgpt_plus_core::codex_home_apply::reconcile(
        temp.path(),
        CodexHomeReconcileIntent::ApplyActiveProfile {
            settings: &settings,
        },
    )
    .unwrap();

    let applied = std::fs::read_to_string(temp.path().join("config.toml")).unwrap();
    assert!(applied.contains("model_provider = \"ai\""));
    assert!(applied.contains("[model_providers.ai]"));
    assert!(!applied.contains("[model_providers.custom]"));
}

#[test]
fn save_relay_file_in_home_only_allows_known_files() {
    let temp = tempfile::tempdir().unwrap();

    save_relay_file_in_home(temp.path(), "config", "model = \"gpt-5\"\n").unwrap();
    save_relay_file_in_home(temp.path(), "auth", "{}\n").unwrap();

    assert_eq!(
        std::fs::read_to_string(temp.path().join("config.toml")).unwrap(),
        "model = \"gpt-5\"\n"
    );
    assert_eq!(
        std::fs::read_to_string(temp.path().join("auth.json")).unwrap(),
        "{}\n"
    );
    assert!(save_relay_file_in_home(temp.path(), "../bad", "").is_err());
}

#[test]
fn normalize_settings_before_save_drops_legacy_managed_extensions() {
    let settings = BackendSettings {
        relay_common_config_contents:
            "skills.config = [{ path = \"/tmp/review\" }]\n\n[mcp_servers.context7]\ncommand = \"npx\"\n"
                .to_string(),
        relay_profiles: vec![RelayProfile {
            use_common_config: false,
            config_contents:
                "model = \"gpt-5\"\nplugins.demo = { enabled = true }\n\n[mcp_servers.context7]\ncommand = \"npx\"\n"
                    .to_string(),
            ..RelayProfile::default()
        }],
        ..BackendSettings::default()
    };

    let normalized = normalize_settings_before_save(settings);

    assert!(
        normalized.relay_profiles[0]
            .config_contents
            .contains("model = \"gpt-5\"")
    );
    assert!(
        !normalized.relay_profiles[0]
            .config_contents
            .contains("[mcp_servers.context7]")
    );
    assert!(
        !normalized.relay_profiles[0]
            .config_contents
            .contains("plugins.demo")
    );
    assert!(normalized.relay_context_config_contents.is_empty());
    assert!(
        !normalized
            .relay_common_config_contents
            .contains("[mcp_servers")
    );
    assert!(
        !normalized
            .relay_common_config_contents
            .contains("skills.config")
    );
}

#[test]
fn normalize_settings_before_save_preserves_official_profile_auth() {
    let settings = BackendSettings {
        relay_profiles: vec![RelayProfile {
            relay_mode: chatgpt_plus_core::settings::RelayMode::Official,
            official_mix_api_key: false,
            auth_contents: r#"{"auth_mode":"chatgpt","tokens":{"access_token":"edited"}}"#
                .to_string(),
            config_contents: "model_provider = \"custom\"\n".to_string(),
            ..RelayProfile::default()
        }],
        ..BackendSettings::default()
    };

    let normalized = normalize_settings_before_save(settings);

    let auth_json: serde_json::Value =
        serde_json::from_str(&normalized.relay_profiles[0].auth_contents).unwrap();
    assert_eq!(
        auth_json,
        serde_json::json!({
            "auth_mode": "chatgpt",
            "tokens": {
                "access_token": "edited"
            }
        })
    );
    assert!(normalized.relay_profiles[0].config_contents.is_empty());
}

#[test]
fn normalize_settings_before_save_strips_common_from_enabled_profile() {
    let settings = BackendSettings {
        relay_common_config_contents: r#"model_reasoning_effort = "high"

[features]
goals = true

[plugins."superpowers@openai-curated"]
enabled = true
"#
        .to_string(),
        relay_profiles: vec![RelayProfile {
            use_common_config: true,
            config_contents: r#"model = "gpt-5"
model_reasoning_effort = "high"

[features]
goals = true
model_reasoning_effort = "high"

[plugins."superpowers@openai-curated"]
enabled = true
"#
            .to_string(),
            ..RelayProfile::default()
        }],
        ..BackendSettings::default()
    };

    let normalized = normalize_settings_before_save(settings);
    let config = &normalized.relay_profiles[0].config_contents;

    assert!(config.contains("model = \"gpt-5\""));
    assert!(!config.contains("model_reasoning_effort"));
    assert!(!config.contains("[features]"));
    assert!(!config.contains("[plugins.\"superpowers@openai-curated\"]"));
}

#[test]
fn normalize_settings_before_save_repairs_invalid_profile_common_duplication() {
    let settings = BackendSettings {
        relay_common_config_contents: r#"model_reasoning_effort = "high"

[marketplaces.openai-bundled]
last_updated = "2026-05-25T11:52:46Z"
"#
        .to_string(),
        relay_profiles: vec![RelayProfile {
            use_common_config: true,
            config_contents: r#"model = "gpt-5"
model_reasoning_effort = "high"

[marketplaces.openai-bundled]
last_updated = "2026-05-25T11:52:46Z"

[marketplaces.openai-bundled]
last_updated = "2026-05-25T11:52:46Z"
"#
            .to_string(),
            ..RelayProfile::default()
        }],
        ..BackendSettings::default()
    };

    let normalized = normalize_settings_before_save(settings);
    let config = &normalized.relay_profiles[0].config_contents;

    assert!(config.contains("model = \"gpt-5\""));
    assert!(!config.contains("model_reasoning_effort"));
    assert!(!config.contains("[marketplaces.openai-bundled]"));
}

#[test]
fn normalize_settings_before_save_removes_model_catalog_from_common_config() {
    let settings = BackendSettings {
        relay_common_config_contents:
            r#"model_catalog_json = "C:\\Users\\Administrator\\.codex\\model-catalogs\\relay-a.json"
model_catalog_json = 'C:\Users\Administrator\.codex\model-catalogs\relay-b.json'
model_reasoning_effort = "high"
"#
            .to_string(),
        ..BackendSettings::default()
    };

    let normalized = normalize_settings_before_save(settings);

    assert!(
        !normalized
            .relay_common_config_contents
            .contains("model_catalog_json")
    );
    assert!(
        normalized
            .relay_common_config_contents
            .contains("model_reasoning_effort = \"high\"")
    );
}

#[test]
fn ads_payload_keeps_version_and_ad_items() {
    let payload = ads_payload(json!({
        "version": 1,
        "ads": [{"id": "ad-1", "type": "normal", "title": "Ad"}]
    }));

    assert_eq!(payload.version, 1);
    assert_eq!(payload.ads.len(), 1);
    assert_eq!(payload.ads[0]["id"], json!("ad-1"));
}

#[test]
fn open_external_url_rejects_non_http_urls() {
    let result = open_external_url("file:///C:/Windows/win.ini".to_string());

    assert_eq!(result.status, "failed");
    assert!(result.message.contains("只允许打开 http 或 https 链接"));
}
