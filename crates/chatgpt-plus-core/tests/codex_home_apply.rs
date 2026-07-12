use chatgpt_plus_core::codex_home_apply::{
    CodexHomeDisposition, CodexHomeReconcileIntent, activate, reconcile,
};
use chatgpt_plus_core::settings::{
    AggregateRelayMember, AggregateRelayProfile, AggregateRelayStrategy, BackendSettings,
    RelayMode, RelayProfile, SettingsStore,
};

#[test]
fn relay_config_exposes_no_superseded_mutation_functions() {
    let source = include_str!("../src/relay_config.rs");
    let crate_root = include_str!("../src/lib.rs");
    let apply_module = include_str!("../src/codex_home_apply.rs");

    for prefix in [
        "pub fn apply_relay",
        "pub fn apply_pure_api",
        "pub fn clear_relay",
        "pub(crate) fn apply_relay",
        "pub(crate) fn clear_relay",
    ] {
        assert!(
            !source.contains(prefix),
            "legacy mutation seam remains: {prefix}"
        );
    }

    for test_only_seam in [
        "fn apply_relay_config_to_home(",
        "fn apply_relay_config_to_home_with_protocol(",
        "fn apply_pure_api_config_to_home(",
        "fn apply_relay_files_to_home(",
        "fn apply_relay_files_to_home_with_common(",
        "fn apply_relay_files_to_home_with_context(",
        "fn apply_relay_profile_files_to_home_with_context(",
        "fn apply_relay_profile_to_home_with_switch_rules(",
        "fn apply_relay_config_file_to_home(",
        "fn apply_pure_api_config_to_home_with_protocol(",
        "fn clear_relay_config_to_home(",
        "fn clear_relay_config_to_home_with_auth(",
    ] {
        assert!(
            !source.contains(test_only_seam),
            "test-only legacy mutation seam remains: {test_only_seam}"
        );
    }

    assert!(!source.contains("RelayApplyResult"));
    assert!(!source.contains("pub fn default_codex_home_dir"));
    assert!(
        !apply_module.contains("    Unchanged,"),
        "CodexHomeDisposition must contain only observable mutation outcomes"
    );
    assert!(
        !crate_root.contains("pub mod relay_config;"),
        "relay_config must be owned beneath the codex_home_apply seam"
    );
    assert!(
        apply_module.contains("pub mod relay_config;"),
        "codex_home_apply must structurally own relay_config mutation access"
    );
}

fn pure_api_settings() -> BackendSettings {
    BackendSettings {
        relay_profiles: vec![RelayProfile {
            id: "pure-api".to_string(),
            name: "Pure API".to_string(),
            relay_mode: RelayMode::PureApi,
            config_contents: r#"model = "gpt-5"
model_provider = "custom"

[model_providers.custom]
name = "custom"
base_url = "https://relay.example/v1"
wire_api = "responses"
requires_openai_auth = true
"#
            .to_string(),
            auth_contents: r#"{"OPENAI_API_KEY":"sk-test"}"#.to_string(),
            ..RelayProfile::default()
        }],
        active_relay_id: "pure-api".to_string(),
        ..BackendSettings::default()
    }
}

fn pure_profile(id: &str, base_url: &str, api_key: &str) -> RelayProfile {
    RelayProfile {
        id: id.to_string(),
        name: id.to_uppercase(),
        relay_mode: RelayMode::PureApi,
        config_contents: format!(
            r#"model_provider = "custom"

[model_providers.custom]
name = "custom"
base_url = "{base_url}"
wire_api = "responses"
requires_openai_auth = true
"#
        ),
        auth_contents: format!(r#"{{"OPENAI_API_KEY":"{api_key}"}}"#),
        ..RelayProfile::default()
    }
}

fn write_live_pure_api(home: &std::path::Path, base_url: &str, api_key: &str) {
    std::fs::create_dir_all(home).unwrap();
    std::fs::write(
        home.join("config.toml"),
        format!(
            r#"model = "live-edited-model"
model_provider = "live_provider"
model_context_window = 1000000
model_auto_compact_token_limit = 900000

[model_providers.live_provider]
name = "live_provider"
base_url = "{base_url}"
wire_api = "responses"
requires_openai_auth = true
"#
        ),
    )
    .unwrap();
    std::fs::write(
        home.join("auth.json"),
        format!(r#"{{"OPENAI_API_KEY":"{api_key}"}}"#),
    )
    .unwrap();
}

#[test]
fn explicit_clear_discards_non_official_snapshot_and_preserves_live_official_tokens() {
    let home = tempfile::tempdir().unwrap();
    std::fs::write(
        home.path().join("config.toml"),
        r#"model_provider = "custom"

[model_providers.custom]
name = "custom"
base_url = "https://relay.example/v1"
wire_api = "responses"
requires_openai_auth = true
"#,
    )
    .unwrap();
    std::fs::write(
        home.path().join("auth.json"),
        r#"{"OPENAI_API_KEY":"sk-live","auth_mode":"chatgpt","tokens":{"access_token":"official"}}"#,
    )
    .unwrap();
    let settings = BackendSettings {
        relay_profiles: vec![RelayProfile {
            id: "pure".to_string(),
            relay_mode: RelayMode::PureApi,
            auth_contents: r#"{"OPENAI_API_KEY":"sk-snapshot"}"#.to_string(),
            ..RelayProfile::default()
        }],
        active_relay_id: "pure".to_string(),
        ..BackendSettings::default()
    };

    let outcome = reconcile(
        home.path(),
        CodexHomeReconcileIntent::ClearManagedRelay {
            settings: &settings,
        },
    )
    .unwrap();

    let auth: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(home.path().join("auth.json")).unwrap())
            .unwrap();
    assert_eq!(outcome.disposition, CodexHomeDisposition::Cleared);
    assert!(!outcome.status.configured);
    assert!(outcome.backup_path.is_some());
    assert!(auth.get("OPENAI_API_KEY").is_none());
    assert_eq!(auth["auth_mode"], "chatgpt");
    assert_eq!(auth["tokens"]["access_token"], "official");
}

#[test]
fn explicit_clear_restores_the_active_official_auth_snapshot_even_for_mixed_mode() {
    let home = tempfile::tempdir().unwrap();
    std::fs::write(
        home.path().join("auth.json"),
        r#"{"OPENAI_API_KEY":"sk-live","tokens":{"access_token":"stale"}}"#,
    )
    .unwrap();
    let official_auth = r#"{"auth_mode":"chatgpt","tokens":{"access_token":"official-snapshot"},"account_id":"acct-1"}"#;
    let settings = BackendSettings {
        relay_profiles: vec![RelayProfile {
            id: "official".to_string(),
            relay_mode: RelayMode::Official,
            official_mix_api_key: true,
            auth_contents: official_auth.to_string(),
            ..RelayProfile::default()
        }],
        active_relay_id: "official".to_string(),
        ..BackendSettings::default()
    };

    let outcome = reconcile(
        home.path(),
        CodexHomeReconcileIntent::ClearManagedRelay {
            settings: &settings,
        },
    )
    .unwrap();

    assert_eq!(outcome.disposition, CodexHomeDisposition::Cleared);
    assert_eq!(
        std::fs::read_to_string(home.path().join("auth.json")).unwrap(),
        official_auth
    );
}

#[test]
fn explicit_clear_works_when_relay_profiles_are_disabled() {
    let home = tempfile::tempdir().unwrap();
    std::fs::write(
        home.path().join("config.toml"),
        r#"model_provider = "custom"

[model_providers.custom]
name = "custom"
base_url = "https://relay.example/v1"
wire_api = "responses"
requires_openai_auth = true
"#,
    )
    .unwrap();
    std::fs::write(
        home.path().join("auth.json"),
        r#"{"OPENAI_API_KEY":"sk-live","tokens":{"access_token":"official"}}"#,
    )
    .unwrap();
    let settings = BackendSettings {
        relay_profiles_enabled: false,
        ..pure_api_settings()
    };
    let original_settings = settings.clone();

    let outcome = reconcile(
        home.path(),
        CodexHomeReconcileIntent::ClearManagedRelay {
            settings: &settings,
        },
    )
    .unwrap();

    assert_eq!(outcome.disposition, CodexHomeDisposition::Cleared);
    assert!(!outcome.status.configured);
    assert_eq!(settings, original_settings);
}

#[test]
fn pure_api_profile_is_applied_and_reported_from_the_written_home() {
    let home = tempfile::tempdir().unwrap();

    let settings = pure_api_settings();
    let outcome = reconcile(
        home.path(),
        CodexHomeReconcileIntent::ApplyActiveProfile {
            settings: &settings,
        },
    )
    .unwrap();

    assert_eq!(outcome.disposition, CodexHomeDisposition::Applied);
    assert!(outcome.status.configured);
    assert!(home.path().join("config.toml").is_file());
    assert!(home.path().join("auth.json").is_file());
}

#[test]
fn official_non_mixed_profile_clears_managed_relay_keys() {
    let home = tempfile::tempdir().unwrap();
    std::fs::write(
        home.path().join("config.toml"),
        r#"model = "old"
model_provider = "custom"

[model_providers.custom]
name = "custom"
base_url = "https://old.example/v1"
wire_api = "responses"
requires_openai_auth = true

[mcp_servers.user_owned]
command = "keep-me"
"#,
    )
    .unwrap();
    std::fs::write(
        home.path().join("auth.json"),
        r#"{"OPENAI_API_KEY":"sk-old","tokens":{"access_token":"official"}}"#,
    )
    .unwrap();
    let settings = BackendSettings {
        relay_profiles: vec![RelayProfile {
            id: "official".to_string(),
            name: "Official".to_string(),
            relay_mode: RelayMode::Official,
            official_mix_api_key: false,
            ..RelayProfile::default()
        }],
        active_relay_id: "official".to_string(),
        ..BackendSettings::default()
    };

    let outcome = reconcile(
        home.path(),
        CodexHomeReconcileIntent::ApplyActiveProfile {
            settings: &settings,
        },
    )
    .unwrap();

    let config = std::fs::read_to_string(home.path().join("config.toml")).unwrap();
    let auth: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(home.path().join("auth.json")).unwrap())
            .unwrap();
    assert_eq!(outcome.disposition, CodexHomeDisposition::Cleared);
    assert!(!outcome.status.configured);
    assert!(!config.contains("model_provider"));
    assert!(!config.contains("[model_providers.custom]"));
    assert!(config.contains("[mcp_servers.user_owned]"));
    assert!(auth.get("OPENAI_API_KEY").is_none());
    assert_eq!(auth["tokens"]["access_token"], "official");
}

#[test]
fn disabled_reconciliation_returns_an_error_without_writing() {
    let home = tempfile::tempdir().unwrap();
    let config_path = home.path().join("config.toml");
    let auth_path = home.path().join("auth.json");
    std::fs::write(&config_path, "sentinel-config").unwrap();
    std::fs::write(&auth_path, "sentinel-auth").unwrap();
    let settings = BackendSettings {
        relay_profiles_enabled: false,
        ..pure_api_settings()
    };

    let error = reconcile(
        home.path(),
        CodexHomeReconcileIntent::ApplyActiveProfile {
            settings: &settings,
        },
    )
    .unwrap_err();

    assert!(error.to_string().contains("关闭"));
    assert_eq!(
        std::fs::read_to_string(config_path).unwrap(),
        "sentinel-config"
    );
    assert_eq!(std::fs::read_to_string(auth_path).unwrap(), "sentinel-auth");
}

#[test]
fn common_and_context_config_are_both_merged_into_the_profile() {
    let home = tempfile::tempdir().unwrap();
    let settings = BackendSettings {
        relay_common_config_contents: r#"

[mcp_servers.common]
command = "common-command"

"#
        .to_string(),
        relay_context_config_contents: r#"
[skills.context]
path = "/tmp/context-skill"

"#
        .to_string(),
        ..pure_api_settings()
    };

    reconcile(
        home.path(),
        CodexHomeReconcileIntent::ApplyActiveProfile {
            settings: &settings,
        },
    )
    .unwrap();

    let config = std::fs::read_to_string(home.path().join("config.toml")).unwrap();
    assert!(config.contains("[mcp_servers.common]"));
    assert!(config.contains(r#"command = "common-command""#));
    assert!(config.contains("[skills.context]"));
    assert!(config.contains(r#"path = "/tmp/context-skill""#));
}

#[test]
fn aggregate_profile_is_projected_to_the_local_proxy_through_reconcile() {
    let home = tempfile::tempdir().unwrap();
    let settings = BackendSettings {
        relay_profiles: vec![RelayProfile {
            id: "aggregate".to_string(),
            name: "Aggregate".to_string(),
            relay_mode: RelayMode::Aggregate,
            ..RelayProfile::default()
        }],
        active_relay_id: "aggregate".to_string(),
        ..BackendSettings::default()
    };

    let outcome = reconcile(
        home.path(),
        CodexHomeReconcileIntent::ApplyActiveProfile {
            settings: &settings,
        },
    )
    .unwrap();

    let config = std::fs::read_to_string(home.path().join("config.toml")).unwrap();
    assert_eq!(outcome.disposition, CodexHomeDisposition::Applied);
    assert!(outcome.status.configured);
    assert!(config.contains(r#"base_url = "http://127.0.0.1:57321/v1""#));
    assert!(config.contains(r#"experimental_bearer_token = "chatgpt-plus-aggregate""#));
}

#[test]
fn pure_api_profile_must_be_configured_after_the_apply_operation() {
    let home = tempfile::tempdir().unwrap();
    let mut settings = pure_api_settings();
    settings.relay_profiles[0].auth_contents = "{}".to_string();

    let error = reconcile(
        home.path(),
        CodexHomeReconcileIntent::ApplyActiveProfile {
            settings: &settings,
        },
    )
    .unwrap_err();

    assert!(error.to_string().contains("纯 API"));
}

#[test]
fn activation_backfills_the_stored_previous_profile_before_selecting_the_target() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex");
    write_live_pure_api(&home, "https://edited-a.example/v1", "sk-edited-a");
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let original = BackendSettings {
        active_relay_id: "a".to_string(),
        relay_profiles: vec![
            pure_profile("a", "https://a.example/v1", "sk-a"),
            pure_profile("b", "https://b.example/v1", "sk-b"),
        ],
        ..BackendSettings::default()
    };
    store.save(&original).unwrap();
    let mut requested = original.clone();
    requested.active_relay_id = "a".to_string();

    let activation = activate(&store, &home, requested, "b").unwrap();

    let previous = activation
        .settings
        .relay_profiles
        .iter()
        .find(|profile| profile.id == "a")
        .unwrap();
    assert_eq!(activation.settings.active_relay_id, "b");
    assert!(previous.config_contents.contains("live-edited-model"));
    assert!(previous.config_contents.contains("live_provider"));
    assert_eq!(previous.context_window, "1000000");
    assert_eq!(previous.auto_compact_limit, "900000");
    assert_eq!(store.load().unwrap(), activation.settings);
    assert_eq!(activation.home.disposition, CodexHomeDisposition::Applied);
}

#[test]
fn activation_rejects_a_missing_target_without_mutating_settings_or_home() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex");
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let original = BackendSettings {
        active_relay_id: "a".to_string(),
        relay_profiles: vec![pure_profile("a", "https://a.example/v1", "sk-a")],
        ..BackendSettings::default()
    };
    store.save(&original).unwrap();
    let persisted_original = store.load().unwrap();

    let error = activate(&store, &home, original.clone(), "missing").unwrap_err();

    assert!(error.to_string().contains("missing"));
    assert_eq!(store.load().unwrap(), persisted_original);
    assert!(!home.exists());
}

#[test]
fn activation_rejects_a_missing_previous_profile_before_writing() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex");
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let original = BackendSettings {
        active_relay_id: "removed".to_string(),
        relay_profiles: vec![pure_profile("b", "https://b.example/v1", "sk-b")],
        ..BackendSettings::default()
    };
    store.save(&original).unwrap();
    let persisted_original = store.load().unwrap();

    let error = activate(&store, &home, original.clone(), "b").unwrap_err();

    assert!(error.to_string().contains("当前供应商"));
    assert_eq!(store.load().unwrap(), persisted_original);
    assert!(!home.exists());
}

#[test]
fn activation_rolls_settings_back_when_the_home_apply_fails() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex");
    write_live_pure_api(&home, "https://a.example/v1", "sk-a");
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let original = BackendSettings {
        active_relay_id: "a".to_string(),
        relay_profiles: vec![pure_profile("a", "https://a.example/v1", "sk-a")],
        ..BackendSettings::default()
    };
    store.save(&original).unwrap();
    let persisted_original = store.load().unwrap();
    let requested = BackendSettings {
        active_relay_id: "a".to_string(),
        relay_profiles: vec![
            original.relay_profiles[0].clone(),
            RelayProfile {
                id: "bad".to_string(),
                name: "Bad".to_string(),
                relay_mode: RelayMode::PureApi,
                config_contents: "model_provider = \"custom\"\n".to_string(),
                auth_contents: "{bad json".to_string(),
                ..RelayProfile::default()
            },
        ],
        ..BackendSettings::default()
    };

    let error = activate(&store, &home, requested, "bad").unwrap_err();

    assert!(error.to_string().contains("auth.json"));
    assert_eq!(store.load().unwrap(), persisted_original);
}

#[test]
fn activation_rolls_settings_back_when_pure_api_postcondition_fails() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex");
    write_live_pure_api(&home, "https://a.example/v1", "sk-a");
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let original = BackendSettings {
        active_relay_id: "a".to_string(),
        relay_profiles: vec![pure_profile("a", "https://a.example/v1", "sk-a")],
        ..BackendSettings::default()
    };
    store.save(&original).unwrap();
    let persisted_original = store.load().unwrap();
    let original_config = std::fs::read(home.join("config.toml")).unwrap();
    let original_auth = std::fs::read(home.join("auth.json")).unwrap();
    let mut unconfigured = pure_profile("empty-key", "https://empty.example/v1", "");
    unconfigured.auth_contents = "{}".to_string();
    let requested = BackendSettings {
        active_relay_id: "a".to_string(),
        relay_profiles: vec![original.relay_profiles[0].clone(), unconfigured],
        ..BackendSettings::default()
    };

    let error = activate(&store, &home, requested, "empty-key").unwrap_err();

    assert!(error.to_string().contains("纯 API"));
    assert_eq!(store.load().unwrap(), persisted_original);
    assert_eq!(
        std::fs::read(home.join("config.toml")).unwrap(),
        original_config
    );
    assert_eq!(
        std::fs::read(home.join("auth.json")).unwrap(),
        original_auth
    );
}

#[test]
fn activation_removes_home_files_created_before_a_postcondition_failure() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex");
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let original = BackendSettings {
        active_relay_id: "empty-key".to_string(),
        relay_profiles: vec![pure_profile(
            "empty-key",
            "https://old.example/v1",
            "sk-old",
        )],
        ..BackendSettings::default()
    };
    store.save(&original).unwrap();
    let persisted_original = store.load().unwrap();
    let mut unconfigured = pure_profile("empty-key", "https://empty.example/v1", "");
    unconfigured.auth_contents = "{}".to_string();
    let requested = BackendSettings {
        active_relay_id: "empty-key".to_string(),
        relay_profiles: vec![unconfigured],
        ..BackendSettings::default()
    };

    let error = activate(&store, &home, requested, "empty-key").unwrap_err();

    assert!(error.to_string().contains("纯 API"));
    assert_eq!(store.load().unwrap(), persisted_original);
    assert!(!home.join("config.toml").exists());
    assert!(!home.join("auth.json").exists());
}

#[test]
fn activation_restores_the_exact_raw_settings_after_a_postcondition_failure() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex");
    write_live_pure_api(&home, "https://a.example/v1", "sk-a");
    let settings_path = temp.path().join("settings.json");
    let raw_settings = br#"{
  "futureExtension": { "preserveExactly": true },
  "activeRelayId": "a",
  "relayProfiles": [
    {
      "id": "a", "name": "A", "relayMode": "pureApi",
      "configContents": "model_provider = \"custom\"\n\n[model_providers.custom]\nname = \"custom\"\nbase_url = \"https://a.example/v1\"\nwire_api = \"responses\"\nrequires_openai_auth = true\n",
      "authContents": "{\"OPENAI_API_KEY\":\"sk-a\"}"
    }
  ]
}
"#;
    std::fs::write(&settings_path, raw_settings).unwrap();
    let store = SettingsStore::new(settings_path.clone());
    let original = store.load().unwrap();
    let mut unconfigured = pure_profile("empty-key", "https://empty.example/v1", "");
    unconfigured.auth_contents = "{}".to_string();
    let mut requested = original;
    requested.relay_profiles.push(unconfigured);

    let error = activate(&store, &home, requested, "empty-key").unwrap_err();

    assert!(error.to_string().contains("纯 API"));
    assert_eq!(std::fs::read(settings_path).unwrap(), raw_settings);
}

#[test]
fn activation_removes_a_settings_file_created_before_a_postcondition_failure() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex");
    let settings_path = temp.path().join("settings.json");
    let store = SettingsStore::new(settings_path.clone());
    let mut unconfigured = pure_profile("default", "https://empty.example/v1", "");
    unconfigured.auth_contents = "{}".to_string();
    let requested = BackendSettings {
        active_relay_id: "default".to_string(),
        relay_profiles: vec![unconfigured],
        ..BackendSettings::default()
    };

    let error = activate(&store, &home, requested, "default").unwrap_err();

    assert!(error.to_string().contains("纯 API"), "{error:#}");
    assert!(!settings_path.exists());
}

#[test]
fn activation_accepts_an_aggregate_target_with_an_empty_config_snapshot() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex");
    std::fs::create_dir(&home).unwrap();
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let api = pure_profile("api", "https://api.example/v1", "sk-api");
    let aggregate = RelayProfile {
        id: "agg".to_string(),
        name: "聚合供应商 1".to_string(),
        relay_mode: RelayMode::Aggregate,
        config_contents: String::new(),
        auth_contents: String::new(),
        ..RelayProfile::default()
    };
    let original = BackendSettings {
        active_relay_id: "api".to_string(),
        relay_profiles: vec![api.clone(), aggregate.clone()],
        ..BackendSettings::default()
    };
    store.save(&original).unwrap();
    let requested = BackendSettings {
        active_relay_id: "agg".to_string(),
        relay_profiles: vec![api, aggregate],
        aggregate_relay_profiles: vec![AggregateRelayProfile {
            id: "agg".to_string(),
            name: "聚合供应商 1".to_string(),
            strategy: AggregateRelayStrategy::Failover,
            members: vec![AggregateRelayMember {
                relay_id: "api".to_string(),
                weight: 1,
            }],
        }],
        active_aggregate_relay_id: "agg".to_string(),
        ..BackendSettings::default()
    };

    let activation = activate(&store, &home, requested, "agg").unwrap();
    let live = std::fs::read_to_string(home.join("config.toml")).unwrap();

    assert!(activation.home.status.configured);
    assert_eq!(store.load().unwrap().active_relay_id, "agg");
    assert!(live.contains(r#"base_url = "http://127.0.0.1:57321/v1""#));
}

#[test]
fn activation_returns_the_normalized_previous_official_profile() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex");
    std::fs::create_dir(&home).unwrap();
    std::fs::write(
        home.join("config.toml"),
        r#"model = "gpt-5.5"
model_reasoning_effort = "high"
model_provider = "custom"

[model_providers.custom]
name = "custom"
wire_api = "responses"
requires_openai_auth = true
base_url = "https://third-party.example/v1"

[features]
goals = true
"#,
    )
    .unwrap();
    std::fs::write(
        home.join("auth.json"),
        r#"{"OPENAI_API_KEY":"sk-third-party"}"#,
    )
    .unwrap();
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let official = RelayProfile {
        id: "official".to_string(),
        name: "官方".to_string(),
        relay_mode: RelayMode::Official,
        official_mix_api_key: false,
        auth_contents: r#"{"auth_mode":"chatgpt","tokens":{"access_token":"official"}}"#
            .to_string(),
        ..RelayProfile::default()
    };
    let pure = pure_profile("api", "https://third-party.example/v1", "sk-third-party");
    let original = BackendSettings {
        active_relay_id: "official".to_string(),
        relay_profiles: vec![official.clone(), pure.clone()],
        ..BackendSettings::default()
    };
    store.save(&original).unwrap();
    let requested = BackendSettings {
        active_relay_id: "api".to_string(),
        relay_profiles: vec![official, pure],
        ..BackendSettings::default()
    };

    let activation = activate(&store, &home, requested, "api").unwrap();
    let returned = activation
        .settings
        .relay_profiles
        .iter()
        .find(|profile| profile.id == "official")
        .unwrap();

    assert_eq!(returned.relay_mode, RelayMode::Official);
    assert!(!returned.official_mix_api_key);
    assert!(returned.config_contents.is_empty());
    assert!(returned.api_key.is_empty());
}

#[cfg(windows)]
#[test]
fn computer_use_guard_setting_is_forwarded_to_the_profile_apply() {
    let home = tempfile::tempdir().unwrap();
    let helper = home
        .path()
        .join("plugins")
        .join("cache")
        .join("openai-bundled")
        .join("computer-use")
        .join("26.608.12217")
        .join("node_modules")
        .join("@oai")
        .join("sky")
        .join("bin")
        .join("windows")
        .join("codex-computer-use.exe");
    std::fs::create_dir_all(helper.parent().unwrap()).unwrap();
    std::fs::write(helper, "").unwrap();
    let settings = BackendSettings {
        computer_use_guard_enabled: true,
        ..pure_api_settings()
    };

    reconcile(
        home.path(),
        CodexHomeReconcileIntent::ApplyActiveProfile {
            settings: &settings,
        },
    )
    .unwrap();

    let config = std::fs::read_to_string(home.path().join("config.toml")).unwrap();
    assert!(config.contains("[plugins.\"computer-use@openai-bundled\"]"));
    assert!(config.contains("codex-computer-use.exe"));
}

#[cfg(windows)]
#[test]
fn computer_use_guard_setting_is_forwarded_to_explicit_clear() {
    let home = tempfile::tempdir().unwrap();
    let helper = home
        .path()
        .join("plugins")
        .join("cache")
        .join("openai-bundled")
        .join("computer-use")
        .join("26.608.12217")
        .join("node_modules")
        .join("@oai")
        .join("sky")
        .join("bin")
        .join("windows")
        .join("codex-computer-use.exe");
    std::fs::create_dir_all(helper.parent().unwrap()).unwrap();
    std::fs::write(helper, "").unwrap();
    std::fs::write(
        home.path().join("config.toml"),
        "model_provider = \"custom\"\n",
    )
    .unwrap();
    let settings = BackendSettings {
        computer_use_guard_enabled: true,
        ..pure_api_settings()
    };

    reconcile(
        home.path(),
        CodexHomeReconcileIntent::ClearManagedRelay {
            settings: &settings,
        },
    )
    .unwrap();

    let config = std::fs::read_to_string(home.path().join("config.toml")).unwrap();
    assert!(config.contains("[plugins.\"computer-use@openai-bundled\"]"));
    assert!(config.contains("codex-computer-use.exe"));
}
