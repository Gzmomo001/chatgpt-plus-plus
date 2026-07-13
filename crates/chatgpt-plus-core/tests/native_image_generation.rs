use chatgpt_plus_core::native_image_generation::NativeImageGenerationConfig;
use chatgpt_plus_core::settings::{RelayMode, RelayProfile, RelayProtocol};
use serde_json::json;

fn image_profile() -> RelayProfile {
    RelayProfile {
        model: "chat-model".to_string(),
        protocol: RelayProtocol::Responses,
        native_image_generation_enabled: true,
        relay_mode: RelayMode::PureApi,
        ..RelayProfile::default()
    }
}

#[test]
fn disabled_projection_keeps_existing_provider_behavior() {
    let profile = RelayProfile {
        model: "chat-model".to_string(),
        protocol: RelayProtocol::Responses,
        relay_mode: RelayMode::PureApi,
        ..RelayProfile::default()
    };
    let config = r#"model = "chat-model"
model_provider = "custom"

[features]
js_repl = true

[model_providers.custom]
wire_api = "responses"
requires_openai_auth = true
base_url = "https://provider.example/v1"
http_headers = { "x-user-header" = "user-value" }
"#;

    let projected = NativeImageGenerationConfig::from_profile(&profile)
        .apply_to_config(config)
        .unwrap();

    assert!(projected.contains("js_repl = true"));
    assert!(!projected.contains("image_generation"));
    assert!(projected.contains("requires_openai_auth = true"));
    assert!(projected.contains("x-user-header"));
    assert!(!projected.contains("chatgpt-plus-imagegen-v1"));
}

#[test]
fn disabling_removes_only_managed_marker_and_restores_existing_auth_behavior() {
    let profile = RelayProfile {
        model: "chat-model".to_string(),
        protocol: RelayProtocol::Responses,
        relay_mode: RelayMode::PureApi,
        ..RelayProfile::default()
    };
    let previously_enabled = r#"model = "chat-model"
model_provider = "custom"

[features]
image_generation = true
js_repl = true

[model_providers.custom]
wire_api = "responses"
requires_openai_auth = false
base_url = "https://provider.example/v1"
http_headers = { "x-user-header" = "user-value", "x-openai-actor-authorization" = "chatgpt-plus-imagegen-v1" }
"#;

    let projected = NativeImageGenerationConfig::from_profile(&profile)
        .apply_to_config(previously_enabled)
        .unwrap();

    assert!(!projected.contains("image_generation"));
    assert!(!projected.contains("chatgpt-plus-imagegen-v1"));
    assert!(projected.contains("requires_openai_auth = true"));
    assert!(projected.contains("js_repl = true"));
    assert!(projected.contains("x-user-header"));
    assert!(projected.contains("user-value"));
}

#[test]
fn chat_completions_profile_cannot_keep_native_image_generation_enabled() {
    let mut profile = image_profile();
    profile.protocol = RelayProtocol::ChatCompletions;

    NativeImageGenerationConfig::normalize_profile(&mut profile);

    assert!(!profile.native_image_generation_enabled);
}

#[test]
fn model_catalog_projection_changes_only_the_current_chat_model() {
    let config = NativeImageGenerationConfig::from_profile(&image_profile());
    let mut catalog = json!({
        "models": [
            { "slug": "chat-model", "input_modalities": ["text"] },
            { "slug": "other-model", "input_modalities": ["text"] }
        ]
    });

    assert!(config.ensure_current_model_input_modalities(&mut catalog));
    assert_eq!(
        catalog["models"][0]["input_modalities"],
        json!(["text", "image"])
    );
    assert_eq!(catalog["models"][1]["input_modalities"], json!(["text"]));
}

#[test]
fn backfill_cleanup_restores_user_owned_values_from_the_profile_baseline() {
    let baseline = r#"model_provider = "custom"

[features]
image_generation = false

[model_providers.custom]
requires_openai_auth = false
http_headers = { "x-openai-actor-authorization" = "user-owned-actor", "x-user" = "keep" }
"#;
    let live = r#"model_provider = "custom"

[features]
image_generation = true

[model_providers.custom]
requires_openai_auth = false
http_headers = { "x-openai-actor-authorization" = "chatgpt-plus-imagegen-v1", "x-user" = "keep" }
"#;

    let cleaned =
        NativeImageGenerationConfig::strip_managed_projection_with_baseline(live, baseline)
            .unwrap();

    assert!(cleaned.contains("image_generation = false"));
    assert!(cleaned.contains("requires_openai_auth = false"));
    assert!(cleaned.contains("user-owned-actor"));
    assert!(cleaned.contains("x-user"));
    assert!(cleaned.contains("keep"));
    assert!(!cleaned.contains("chatgpt-plus-imagegen-v1"));
}
