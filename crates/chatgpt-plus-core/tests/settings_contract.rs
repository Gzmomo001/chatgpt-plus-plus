use std::fs;

use chatgpt_plus_core::settings::{
    BackendSettings, RelayMode, RelayProfile, RelayProtocol, SettingsStore,
    normalize_settings_before_save,
};
use serde_json::{Value, json};

#[test]
fn wire_contract_uses_camel_case_and_omits_derived_profile_fields() {
    let settings = BackendSettings {
        active_relay_id: "relay-a".to_string(),
        relay_profiles: vec![RelayProfile {
            id: "relay-a".to_string(),
            name: "Relay A".to_string(),
            model: "gpt-5.4".to_string(),
            base_url: "https://relay.example/v1".to_string(),
            api_key: "sk-derived".to_string(),
            upstream_base_url: "https://upstream.example/v1".to_string(),
            ..RelayProfile::default()
        }],
        ..BackendSettings::default()
    };

    let value = serde_json::to_value(settings).unwrap();
    assert_eq!(value["activeRelayId"], "relay-a");
    assert!(value.get("active_relay_id").is_none());
    assert_eq!(
        value["relayProfiles"][0]["upstreamBaseUrl"],
        "https://upstream.example/v1"
    );
    assert!(value["relayProfiles"][0].get("model").is_none());
    assert!(value["relayProfiles"][0].get("baseUrl").is_none());
    assert!(value["relayProfiles"][0].get("apiKey").is_none());
    assert!(value["relayProfiles"][0].get("contextSelection").is_none());
    assert!(value.get("relayContextConfigContents").is_none());
}

#[test]
fn store_defaults_missing_and_invalid_json_and_preserves_unknown_fields_on_update() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("settings.json");
    let store = SettingsStore::new(path.clone());

    assert_eq!(store.load().unwrap(), BackendSettings::default());
    fs::write(&path, "{invalid json").unwrap();
    assert_eq!(store.load().unwrap(), BackendSettings::default());

    fs::write(
        &path,
        r#"{"providerSyncEnabled":false,"futureSetting":{"enabled":true}}"#,
    )
    .unwrap();
    store.update(json!({"providerSyncEnabled": true})).unwrap();
    let saved: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(saved["providerSyncEnabled"], true);
    assert_eq!(saved["futureSetting"], json!({"enabled": true}));
}

#[test]
fn migration_normalizes_legacy_relay_context_auth_and_model_windows() {
    let settings = BackendSettings {
        relay_common_config_contents:
            "model_reasoning_effort = \"high\"\n\n[mcp_servers.context7]\ncommand = \"pnpm\"\n"
                .to_string(),
        active_relay_id: "chat".to_string(),
        relay_profiles: vec![RelayProfile {
            id: "chat".to_string(),
            name: "Legacy chat".to_string(),
            protocol: RelayProtocol::ChatCompletions,
            relay_mode: RelayMode::PureApi,
            model_list: "deepseek-v4-flash[1M]\ndeepseek-v4-pro".to_string(),
            config_contents: r#"model = "deepseek-chat"
codex_plus_chat_base_url = "https://api.deepseek.com"
model_provider = "custom"

[model_providers.custom]
wire_api = "responses"
base_url = "http://127.0.0.1:57321/v1"
"#
            .to_string(),
            auth_contents: r#"{"OPENAI_API_KEY":"sk-test"}"#.to_string(),
            ..RelayProfile::default()
        }],
        ..BackendSettings::default()
    };

    let normalized = normalize_settings_before_save(settings);
    let profile = &normalized.relay_profiles[0];
    assert_eq!(profile.upstream_base_url, "https://api.deepseek.com");
    assert_eq!(profile.api_key, "sk-test");
    assert_eq!(
        profile.model_list,
        "deepseek-chat\ndeepseek-v4-flash\ndeepseek-v4-pro"
    );
    assert_eq!(
        serde_json::from_str::<Value>(&profile.model_windows).unwrap()["deepseek-v4-flash"],
        "1000000"
    );
    assert!(!profile.config_contents.contains("codex_plus_chat_base_url"));
    assert_eq!(
        normalized.relay_common_config_contents,
        "model_reasoning_effort = \"high\"\n"
    );
    assert!(normalized.relay_context_config_contents.is_empty());
}

#[test]
fn migration_preserves_official_auth_after_removed_renderer_fields() {
    let settings = BackendSettings {
        relay_profiles: vec![RelayProfile {
            relay_mode: RelayMode::Official,
            official_mix_api_key: false,
            auth_contents: r#"{"auth_mode":"chatgpt","tokens":{"access_token":"edited"}}"#
                .to_string(),
            config_contents: "model_provider = \"custom\"\n".to_string(),
            ..RelayProfile::default()
        }],
        ..BackendSettings::default()
    };

    let normalized = normalize_settings_before_save(settings);
    assert_eq!(
        serde_json::from_str::<Value>(&normalized.relay_profiles[0].auth_contents).unwrap(),
        json!({"auth_mode":"chatgpt","tokens":{"access_token":"edited"}})
    );
    assert!(normalized.relay_profiles[0].config_contents.is_empty());
}

#[test]
fn active_relay_falls_back_to_legacy_single_relay_fields() {
    let settings = BackendSettings {
        relay_base_url: "https://legacy.example/v1".to_string(),
        relay_api_key: "sk-legacy".to_string(),
        ..BackendSettings::default()
    };

    let active = settings.active_relay_profile();
    assert_eq!(active.id, "default");
    assert_eq!(active.base_url, "https://legacy.example/v1");
    assert_eq!(active.api_key, "sk-legacy");
    assert_eq!(active.relay_mode, RelayMode::MixedApi);
    assert!(active.official_mix_api_key);
}

#[test]
fn settings_save_atomically_replaces_existing_file_without_leaving_temp_file() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("nested/settings.json");
    let store = SettingsStore::new(path.clone());
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, b"old bytes").unwrap();

    store.save(&BackendSettings::default()).unwrap();

    let saved: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert!(saved.is_object());
    assert!(saved.get("launchMode").is_none());
    assert!(!path.with_extension("json.tmp").exists());
}
