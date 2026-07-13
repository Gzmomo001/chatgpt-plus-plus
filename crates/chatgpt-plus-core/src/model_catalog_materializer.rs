//! 将小型自定义模型声明补全为 Codex 当前要求的完整 ModelsResponse。
//!
//! 完整 ModelInfo 只从 Codex home 的运行时文件读取，并始终作为不透明 JSON 处理。
//! 调用者只提供 ChatGPT++ 拥有的模型 metadata，不接触 Codex prompts 或能力字段。

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CustomModelSpec {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<ReasoningSpec>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReasoningSpec {
    #[serde(default)]
    pub supported: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogMaterializationStatus {
    Ready,
    Degraded,
    Cleared,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogTemplateSource {
    ManagedCatalog,
    ModelsCache,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CatalogMaterializationOutcome {
    pub status: CatalogMaterializationStatus,
    pub source: Option<CatalogTemplateSource>,
    pub catalog_path: Option<PathBuf>,
    pub catalog_relative_path: Option<String>,
    pub changed: bool,
    pub message: String,
}

pub fn materialize_model_catalog(
    codex_home: &Path,
    profile_id: &str,
    model_specs: &[CustomModelSpec],
) -> anyhow::Result<CatalogMaterializationOutcome> {
    materialize_model_catalog_with_runtime_capabilities(codex_home, profile_id, model_specs, None)
}

pub(crate) fn materialize_model_catalog_with_runtime_capabilities(
    codex_home: &Path,
    profile_id: &str,
    model_specs: &[CustomModelSpec],
    image_input_model: Option<&str>,
) -> anyhow::Result<CatalogMaterializationOutcome> {
    let relative_path = managed_catalog_relative_path(profile_id);
    let catalog_path = codex_home.join(&relative_path);
    let specs = canonical_model_specs(model_specs);

    if specs.is_empty() {
        let changed = remove_if_exists(&catalog_path)?;
        return Ok(CatalogMaterializationOutcome {
            status: CatalogMaterializationStatus::Cleared,
            source: None,
            catalog_path: None,
            catalog_relative_path: None,
            changed,
            message: "没有自定义模型声明，managed catalog 已清理。".to_string(),
        });
    }

    let managed = read_valid_catalog(&catalog_path)?;
    let (source, source_kind) = if let Some(catalog) = managed {
        (catalog, CatalogTemplateSource::ManagedCatalog)
    } else if let Some(catalog) = read_valid_catalog(&codex_home.join("models_cache.json"))? {
        (catalog, CatalogTemplateSource::ModelsCache)
    } else {
        return Ok(CatalogMaterializationOutcome {
            status: CatalogMaterializationStatus::Degraded,
            source: None,
            catalog_path: None,
            catalog_relative_path: None,
            changed: false,
            message: "Codex runtime catalog 和 models_cache.json 均不可用；保留所选模型并使用 Codex unknown-model fallback，模型选择器暂时无法生成完整目录。".to_string(),
        });
    };

    let mut catalog = build_catalog_from_opaque_source(source, &specs)?;
    if let Some(model_id) = image_input_model.map(str::trim).filter(|id| !id.is_empty()) {
        ensure_image_input_modalities(&mut catalog, model_id);
    }
    let bytes = serde_json::to_vec_pretty(&catalog)?;
    let changed = std::fs::read(&catalog_path).map_or(true, |existing| existing != bytes);
    if changed {
        crate::atomic_file::write(&catalog_path, &bytes)?;
    }

    Ok(CatalogMaterializationOutcome {
        status: CatalogMaterializationStatus::Ready,
        source: Some(source_kind),
        catalog_path: Some(catalog_path),
        catalog_relative_path: Some(relative_path),
        changed,
        message: "完整 Codex model catalog 已生成。".to_string(),
    })
}

fn ensure_image_input_modalities(catalog: &mut Value, model_id: &str) {
    let Some(models) = catalog.get_mut("models").and_then(Value::as_array_mut) else {
        return;
    };
    let Some(model) = models
        .iter_mut()
        .find(|model| model.get("slug").and_then(Value::as_str) == Some(model_id))
    else {
        return;
    };
    model["input_modalities"] = json!(["text", "image"]);
}

pub fn managed_catalog_relative_path(profile_id: &str) -> String {
    format!(
        "model-catalogs/{}.json",
        profile_id
            .chars()
            .map(|character| {
                if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                    character
                } else {
                    '-'
                }
            })
            .collect::<String>()
    )
}

fn canonical_model_specs(model_specs: &[CustomModelSpec]) -> Vec<CustomModelSpec> {
    let mut seen = HashSet::new();
    model_specs
        .iter()
        .filter_map(|spec| {
            let id = spec.id.trim();
            if id.is_empty() || !seen.insert(id.to_string()) {
                return None;
            }
            Some(CustomModelSpec {
                id: id.to_string(),
                context_window: spec.context_window.filter(|window| *window > 0),
                reasoning: spec.reasoning.as_ref().map(canonical_reasoning),
            })
        })
        .collect()
}

fn canonical_reasoning(reasoning: &ReasoningSpec) -> ReasoningSpec {
    let mut seen = HashSet::new();
    let supported = reasoning
        .supported
        .iter()
        .map(|effort| effort.trim())
        .filter(|effort| !effort.is_empty())
        .filter(|effort| seen.insert((*effort).to_string()))
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    let default = reasoning
        .default
        .as_deref()
        .map(str::trim)
        .filter(|effort| supported.iter().any(|supported| supported == effort))
        .map(ToString::to_string);
    ReasoningSpec { supported, default }
}

fn read_valid_catalog(path: &Path) -> anyhow::Result<Option<Value>> {
    let contents = match std::fs::read(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(error).with_context(|| format!("读取 {} 失败", path.display()));
        }
    };
    let Ok(catalog) = serde_json::from_slice::<Value>(&contents) else {
        return Ok(None);
    };
    Ok(is_valid_full_catalog(&catalog).then_some(catalog))
}

fn is_valid_full_catalog(catalog: &Value) -> bool {
    catalog
        .get("models")
        .and_then(Value::as_array)
        .filter(|models| !models.is_empty())
        .is_some_and(|models| models.iter().all(is_valid_full_model_info))
}

fn is_valid_full_model_info(model: &Value) -> bool {
    let Some(model) = model.as_object() else {
        return false;
    };
    [
        "slug",
        "display_name",
        "description",
        "base_instructions",
        "shell_type",
        "visibility",
    ]
    .iter()
    .all(|key| model.get(*key).is_some_and(Value::is_string))
        && ["supported_in_api"]
            .iter()
            .all(|key| model.get(*key).is_some_and(|value| value.is_boolean()))
        && ["priority", "context_window", "max_context_window"]
            .iter()
            .all(|key| model.get(*key).is_some_and(Value::is_number))
        && model
            .get("supported_reasoning_levels")
            .is_some_and(Value::is_array)
        && model.get("model_messages").is_some()
        && model.get("truncation_policy").is_some_and(Value::is_object)
}

fn build_catalog_from_opaque_source(
    mut source: Value,
    specs: &[CustomModelSpec],
) -> anyhow::Result<Value> {
    let source_models = source
        .get("models")
        .and_then(Value::as_array)
        .context("Codex catalog 缺少 models 数组")?;
    let fallback = source_models
        .first()
        .cloned()
        .context("Codex catalog 没有可用模板 entry")?;
    let by_slug = source_models
        .iter()
        .filter_map(|model| {
            model
                .get("slug")
                .and_then(Value::as_str)
                .map(|slug| (slug.to_string(), model.clone()))
        })
        .collect::<HashMap<_, _>>();

    let models = specs
        .iter()
        .enumerate()
        .map(|(index, spec)| {
            let exact = by_slug.get(&spec.id);
            let mut model = exact.cloned().unwrap_or_else(|| fallback.clone());
            if exact.is_none() {
                apply_conservative_capabilities(&mut model);
            }
            apply_owned_fields(&mut model, spec, index);
            model
        })
        .collect::<Vec<_>>();
    source["models"] = Value::Array(models);
    Ok(source)
}

fn apply_owned_fields(model: &mut Value, spec: &CustomModelSpec, index: usize) {
    model["slug"] = json!(spec.id);
    model["display_name"] = json!(spec.id);
    model["description"] = json!(spec.id);
    if let Some(context_window) = spec.context_window {
        model["context_window"] = json!(context_window);
        model["max_context_window"] = json!(context_window);
    }
    let (supported, default) = match &spec.reasoning {
        Some(reasoning) => (
            reasoning_levels(model, &reasoning.supported),
            reasoning.default.clone(),
        ),
        None => (Vec::new(), None),
    };
    model["supported_reasoning_levels"] = Value::Array(supported);
    model["default_reasoning_level"] = default.map_or(Value::Null, Value::String);
    model["priority"] = json!(1000 + index);
    model["visibility"] = json!("list");
    model["supported_in_api"] = json!(true);
}

fn reasoning_levels(model: &Value, supported: &[String]) -> Vec<Value> {
    let descriptions = model
        .get("supported_reasoning_levels")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|level| {
            Some((
                level.get("effort")?.as_str()?.to_string(),
                level.get("description")?.as_str()?.to_string(),
            ))
        })
        .collect::<HashMap<_, _>>();
    supported
        .iter()
        .map(|effort| {
            json!({
                "effort": effort,
                "description": descriptions.get(effort).cloned().unwrap_or_else(|| effort.clone())
            })
        })
        .collect()
}

fn apply_conservative_capabilities(model: &mut Value) {
    let Some(model) = model.as_object_mut() else {
        return;
    };
    set(model, "model_messages", Value::Null);
    set(model, "supports_reasoning_summaries", json!(false));
    set(model, "default_reasoning_summary", json!("none"));
    set(model, "support_verbosity", json!(false));
    set(model, "default_verbosity", json!("medium"));
    set(model, "web_search_tool_type", json!("text"));
    set(model, "supports_parallel_tool_calls", json!(false));
    set(model, "supports_image_detail_original", json!(false));
    set(model, "experimental_supported_tools", json!([]));
    set(model, "input_modalities", json!(["text"]));
    set(model, "supports_search_tool", json!(false));
    set(model, "additional_speed_tiers", json!([]));
    set(model, "service_tiers", json!([]));
    set(model, "default_service_tier", Value::Null);
    set(model, "availability_nux", Value::Null);
    set(model, "upgrade", Value::Null);
    set(model, "include_skills_usage_instructions", json!(false));
    set(model, "use_responses_lite", json!(false));
    set(model, "auto_review_model_override", Value::Null);
    for key in ["comp_hash", "tool_mode", "multi_agent_version"] {
        model.remove(key);
    }
}

fn set(model: &mut Map<String, Value>, key: &str, value: Value) {
    model.insert(key.to_string(), value);
}

fn remove_if_exists(path: &Path) -> anyhow::Result<bool> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error).with_context(|| format!("删除 {} 失败", path.display())),
    }
}
