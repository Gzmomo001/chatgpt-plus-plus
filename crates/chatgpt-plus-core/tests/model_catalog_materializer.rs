use chatgpt_plus_core::model_catalog_materializer::{
    CatalogMaterializationStatus, CatalogTemplateSource, CustomModelSpec, ReasoningSpec,
    materialize_model_catalog,
};
use serde_json::{Value, json};
use std::path::Path;

fn full_model(slug: &str) -> Value {
    json!({
        "slug": slug,
        "display_name": slug,
        "description": slug,
        "default_reasoning_level": "medium",
        "supported_reasoning_levels": [{"effort": "medium", "description": "Medium"}],
        "shell_type": "shell_command",
        "visibility": "list",
        "supported_in_api": true,
        "priority": 0,
        "base_instructions": "instructions from Codex",
        "model_messages": {"instructions_template": "template from Codex"},
        "truncation_policy": {"mode": "tokens", "limit": 10_000},
        "context_window": 272_000,
        "max_context_window": 272_000,
        "effective_context_window_percent": 95,
        "supports_reasoning_summaries": true,
        "default_reasoning_summary": "none",
        "support_verbosity": true,
        "default_verbosity": "medium",
        "apply_patch_tool_type": "freeform",
        "web_search_tool_type": "text_and_image",
        "supports_parallel_tool_calls": true,
        "supports_image_detail_original": true,
        "experimental_supported_tools": [],
        "input_modalities": ["text", "image"],
        "supports_search_tool": true,
        "additional_speed_tiers": [],
        "service_tiers": [],
        "availability_nux": null,
        "upgrade": null,
        "future_codex_field": {"preserve": true}
    })
}

#[test]
fn repository_does_not_bundle_a_full_model_info_template() {
    assert!(
        !Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("assets/model-catalog-template.json")
            .exists()
    );
}

#[test]
fn materializes_from_models_cache_and_preserves_opaque_fields() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(
        temp.path().join("models_cache.json"),
        serde_json::to_vec_pretty(&json!({
            "fetched_at": "now",
            "future_top_level": 42,
            "models": [full_model("codex-template")]
        }))
        .unwrap(),
    )
    .unwrap();
    let specs = vec![
        CustomModelSpec {
            id: "deepseek-v4".to_string(),
            context_window: Some(1_000_000),
            reasoning: Some(ReasoningSpec {
                supported: vec!["low".to_string(), "high".to_string()],
                default: Some("high".to_string()),
            }),
        },
        CustomModelSpec {
            id: "plain-chat".to_string(),
            context_window: None,
            reasoning: None,
        },
    ];

    let outcome = materialize_model_catalog(temp.path(), "relay/a", &specs).unwrap();

    assert_eq!(outcome.status, CatalogMaterializationStatus::Ready);
    assert_eq!(outcome.source, Some(CatalogTemplateSource::ModelsCache));
    assert!(outcome.changed);
    assert_eq!(
        outcome.catalog_relative_path.as_deref(),
        Some("model-catalogs/relay-a.json")
    );
    assert!(
        outcome
            .catalog_path
            .as_ref()
            .unwrap()
            .starts_with(temp.path())
    );
    let catalog: Value =
        serde_json::from_slice(&std::fs::read(outcome.catalog_path.as_ref().unwrap()).unwrap())
            .unwrap();
    assert_eq!(catalog["future_top_level"], 42);
    assert_eq!(catalog["models"][0]["slug"], "deepseek-v4");
    assert_eq!(catalog["models"][0]["context_window"], 1_000_000);
    assert_eq!(catalog["models"][0]["max_context_window"], 1_000_000);
    assert_eq!(catalog["models"][0]["default_reasoning_level"], "high");
    assert_eq!(
        catalog["models"][0]["supported_reasoning_levels"][0]["effort"],
        "low"
    );
    assert_eq!(catalog["models"][0]["future_codex_field"]["preserve"], true);
    assert_eq!(
        catalog["models"][0]["base_instructions"],
        "instructions from Codex"
    );
    assert_eq!(
        catalog["models"][1]["supported_reasoning_levels"],
        json!([])
    );
    assert!(catalog["models"][1]["default_reasoning_level"].is_null());
    assert_eq!(catalog["models"][1]["supports_search_tool"], false);
    assert_eq!(catalog["models"][1]["input_modalities"], json!(["text"]));
}

#[test]
fn regenerates_offline_from_managed_catalog_and_skips_unchanged_writes() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(
        temp.path().join("models_cache.json"),
        serde_json::to_vec(&json!({"models": [full_model("template")]})).unwrap(),
    )
    .unwrap();
    let first_specs = vec![CustomModelSpec {
        id: "model-a".to_string(),
        context_window: Some(128_000),
        reasoning: None,
    }];
    let first = materialize_model_catalog(temp.path(), "relay", &first_specs).unwrap();
    assert_eq!(first.source, Some(CatalogTemplateSource::ModelsCache));
    let preferred_managed = materialize_model_catalog(temp.path(), "relay", &first_specs).unwrap();
    assert_eq!(
        preferred_managed.source,
        Some(CatalogTemplateSource::ManagedCatalog)
    );
    assert!(!preferred_managed.changed);
    std::fs::remove_file(temp.path().join("models_cache.json")).unwrap();

    let second_specs = vec![CustomModelSpec {
        id: "model-a".to_string(),
        context_window: Some(256_000),
        reasoning: None,
    }];
    let second = materialize_model_catalog(temp.path(), "relay", &second_specs).unwrap();
    assert_eq!(second.source, Some(CatalogTemplateSource::ManagedCatalog));
    assert!(second.changed);
    let catalog: Value =
        serde_json::from_slice(&std::fs::read(second.catalog_path.as_ref().unwrap()).unwrap())
            .unwrap();
    assert_eq!(catalog["models"][0]["context_window"], 256_000);

    let unchanged = materialize_model_catalog(temp.path(), "relay", &second_specs).unwrap();
    assert_eq!(
        unchanged.source,
        Some(CatalogTemplateSource::ManagedCatalog)
    );
    assert!(!unchanged.changed);
}

#[test]
fn degrades_without_runtime_sources_and_does_not_write_a_partial_catalog() {
    let temp = tempfile::tempdir().unwrap();
    let specs = vec![CustomModelSpec {
        id: "selected-model".to_string(),
        context_window: None,
        reasoning: None,
    }];

    let outcome = materialize_model_catalog(temp.path(), "relay", &specs).unwrap();

    assert_eq!(outcome.status, CatalogMaterializationStatus::Degraded);
    assert_eq!(outcome.source, None);
    assert_eq!(outcome.catalog_path, None);
    assert!(!temp.path().join("model-catalogs/relay.json").exists());
    assert!(outcome.message.contains("unknown-model fallback"));
}
