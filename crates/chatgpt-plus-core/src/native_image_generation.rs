use serde::Serialize;
use toml_edit::{DocumentMut, InlineTable, Item, Table, TableLike, Value};

use crate::settings::{RelayMode, RelayProfile, RelayProtocol};

pub const ACTOR_HEADER: &str = "x-openai-actor-authorization";
pub const ACTOR_MARKER: &str = "chatgpt-plus-imagegen-v1";

/// Deep module for projecting the native Codex image generation capability.
///
/// Callers provide only a Relay profile or complete TOML text. Eligibility,
/// managed marker ownership, header merging, model capability and diagnostic
/// details remain local to this module.
#[derive(Debug, Clone)]
pub struct NativeImageGenerationConfig {
    explicitly_enabled: bool,
    protocol: RelayProtocol,
    relay_mode: RelayMode,
    current_model: String,
    uses_external_model_catalog: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeImageGenerationDiagnosticCheck {
    pub id: String,
    pub title: String,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeImageGenerationDiagnosis {
    pub explicitly_enabled: bool,
    pub registration_ready: bool,
    pub checks: Vec<NativeImageGenerationDiagnosticCheck>,
}

#[derive(Debug, Clone)]
struct ManagedProjectionBaseline {
    image_generation: Option<Item>,
    requires_openai_auth: Option<Item>,
    actor_header: Option<String>,
}

impl NativeImageGenerationConfig {
    pub fn from_profile(profile: &RelayProfile) -> Self {
        let configured_model = crate::relay_config::relay_profile_model(profile);
        let current_model = if configured_model.trim().is_empty() {
            profile
                .model_list
                .split(['\r', '\n', ','])
                .map(str::trim)
                .find(|value| !value.is_empty())
                .unwrap_or_default()
                .to_string()
        } else {
            configured_model
        };
        let current_model = crate::model_suffix::parse_model_suffix(&current_model).0;
        let generated_catalog = format!(
            "model-catalogs/{}.json",
            sanitize_catalog_filename(&profile.id)
        );
        let uses_external_model_catalog = profile
            .config_contents
            .parse::<DocumentMut>()
            .ok()
            .and_then(|doc| {
                doc.get("model_catalog_json")
                    .and_then(Item::as_str)
                    .map(str::to_string)
            })
            .is_some_and(|catalog| catalog != generated_catalog);
        Self {
            explicitly_enabled: profile.native_image_generation_enabled,
            protocol: profile.protocol,
            relay_mode: profile.relay_mode,
            current_model,
            uses_external_model_catalog,
        }
    }

    pub fn normalize_profile(profile: &mut RelayProfile) {
        if profile.native_image_generation_enabled
            && (profile.protocol != RelayProtocol::Responses
                || profile.relay_mode != RelayMode::PureApi)
        {
            profile.native_image_generation_enabled = false;
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.explicitly_enabled
            && self.protocol == RelayProtocol::Responses
            && self.relay_mode == RelayMode::PureApi
    }

    pub fn should_generate_model_catalog(&self) -> bool {
        self.is_enabled() && !self.current_model.trim().is_empty()
    }

    pub fn model_modality_will_be_ready(&self) -> bool {
        self.should_generate_model_catalog() && !self.uses_external_model_catalog
    }

    pub fn apply_to_config(&self, config_contents: &str) -> anyhow::Result<String> {
        let mut doc = config_contents.parse::<DocumentMut>()?;
        let provider_id = doc
            .get("model_provider")
            .and_then(Item::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("custom")
            .to_string();

        if self.is_enabled() {
            let features = table_mut_or_insert(&mut doc, "features")?;
            features["image_generation"] = toml_edit::value(true);

            let provider = provider_mut(&mut doc, &provider_id)?;
            provider.insert("requires_openai_auth", toml_edit::value(false));
            set_actor_marker(provider);
        } else {
            remove_managed_projection_from_doc(&mut doc, &provider_id, None);
        }

        Ok(ensure_trailing_newline(doc.to_string()))
    }

    pub fn strip_managed_projection(config_contents: &str) -> anyhow::Result<String> {
        Self::strip_managed_projection_with_baseline(config_contents, "")
    }

    pub fn strip_managed_projection_with_baseline(
        config_contents: &str,
        baseline_contents: &str,
    ) -> anyhow::Result<String> {
        let Ok(mut doc) = config_contents.parse::<DocumentMut>() else {
            return Ok(ensure_trailing_newline(config_contents.to_string()));
        };
        let provider_id = doc
            .get("model_provider")
            .and_then(Item::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("custom")
            .to_string();
        let baseline = managed_projection_baseline(baseline_contents);
        remove_managed_projection_from_doc(&mut doc, &provider_id, baseline.as_ref());
        Ok(ensure_trailing_newline(doc.to_string()))
    }

    pub fn config_has_managed_actor_marker(config_contents: &str) -> bool {
        let Ok(doc) = config_contents.parse::<DocumentMut>() else {
            return false;
        };
        let Some(provider_id) = doc
            .get("model_provider")
            .and_then(Item::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return false;
        };
        provider_ref(&doc, provider_id).is_some_and(actor_marker_is_managed)
    }

    pub fn ensure_current_model_input_modalities(&self, catalog: &mut serde_json::Value) -> bool {
        if !self.should_generate_model_catalog() {
            return false;
        }
        let Some(models) = catalog
            .get_mut("models")
            .and_then(serde_json::Value::as_array_mut)
        else {
            return false;
        };
        let Some(model) = models.iter_mut().find(|model| {
            model.get("slug").and_then(serde_json::Value::as_str) == Some(self.current_model.trim())
        }) else {
            return false;
        };
        model["input_modalities"] = serde_json::json!(["text", "image"]);
        true
    }

    pub fn diagnosis(&self, model_modality_ready: bool) -> NativeImageGenerationDiagnosis {
        let mut checks = vec![diagnostic_check(
            "image_generation",
            "Codex 原生图片生成",
            "ok",
            if self.explicitly_enabled {
                "已显式启用 Codex 原生图片生成。"
            } else {
                "未启用 Codex 原生图片生成。"
            },
        )];

        if !self.explicitly_enabled {
            return NativeImageGenerationDiagnosis {
                explicitly_enabled: false,
                registration_ready: false,
                checks,
            };
        }

        let protocol_supported = self.protocol == RelayProtocol::Responses;
        checks.push(diagnostic_check(
            "native_image_generation_protocol",
            "图片生成协议",
            if protocol_supported { "ok" } else { "failed" },
            if protocol_supported {
                "上游使用 Responses API；图片请求会继续直连同一 Base URL。"
            } else {
                "Chat Completions 需要本地协议代理，当前版本不会代理 /images/generations，因此不能启用原生图片生成。"
            },
        ));

        let api_provider = self.relay_mode == RelayMode::PureApi;
        checks.push(diagnostic_check(
            "native_image_generation_provider",
            "图片生成供应商模式",
            if api_provider { "ok" } else { "failed" },
            if api_provider {
                "当前为纯 API 供应商，不影响官方 ChatGPT 登录模式。"
            } else {
                "原生图片生成第一版仅支持纯 API 供应商，官方登录和聚合模式不会写入兼容配置。"
            },
        ));

        checks.push(diagnostic_check(
            "native_image_generation_modality",
            "聊天模型输入模态",
            if model_modality_ready { "ok" } else { "failed" },
            if model_modality_ready {
                "当前聊天模型的 catalog entry 包含 text 和 image 输入模态。"
            } else {
                "当前聊天模型缺少可确认的 image 输入模态，Codex 不会注册 image_gen.imagegen。"
            },
        ));

        let registration_ready = protocol_supported && api_provider && model_modality_ready;
        checks.push(diagnostic_check(
            "native_image_generation_config",
            "Codex 图片生成注册配置",
            if registration_ready { "ok" } else { "failed" },
            if registration_ready {
                "应用时将写入 features.image_generation、requires_openai_auth = false 和 actor marker；该 marker 是当前 Codex 实现的兼容机制，未来版本可能变化。"
            } else {
                "注册条件不完整；继续使用现有 fallback CLI，Provider Doctor 不会发起付费图片请求。actor marker 只是当前 Codex 实现的兼容机制，未来版本可能变化。"
            },
        ));

        NativeImageGenerationDiagnosis {
            explicitly_enabled: true,
            registration_ready,
            checks,
        }
    }
}

fn diagnostic_check(
    id: &str,
    title: &str,
    status: &str,
    detail: &str,
) -> NativeImageGenerationDiagnosticCheck {
    NativeImageGenerationDiagnosticCheck {
        id: id.to_string(),
        title: title.to_string(),
        status: status.to_string(),
        detail: detail.to_string(),
    }
}

fn table_mut_or_insert<'a>(doc: &'a mut DocumentMut, key: &str) -> anyhow::Result<&'a mut Table> {
    if doc.get(key).and_then(Item::as_table).is_none() {
        doc[key] = toml_edit::table();
    }
    doc.get_mut(key)
        .and_then(Item::as_table_mut)
        .ok_or_else(|| anyhow::anyhow!("{key} must be a TOML table"))
}

fn provider_mut<'a>(
    doc: &'a mut DocumentMut,
    provider_id: &str,
) -> anyhow::Result<&'a mut dyn TableLike> {
    doc.get_mut("model_providers")
        .and_then(Item::as_table_like_mut)
        .and_then(|providers| providers.get_mut(provider_id))
        .and_then(Item::as_table_like_mut)
        .ok_or_else(|| anyhow::anyhow!("missing model provider {provider_id}"))
}

fn provider_ref<'a>(doc: &'a DocumentMut, provider_id: &str) -> Option<&'a dyn TableLike> {
    doc.get("model_providers")
        .and_then(Item::as_table_like)
        .and_then(|providers| providers.get(provider_id))
        .and_then(Item::as_table_like)
}

fn set_actor_marker(provider: &mut dyn TableLike) {
    set_actor_header(provider, ACTOR_MARKER);
}

fn set_actor_header(provider: &mut dyn TableLike, value: &str) {
    match provider.get_mut("http_headers") {
        Some(Item::Value(Value::InlineTable(headers))) => {
            headers.insert(ACTOR_HEADER, Value::from(value));
        }
        Some(Item::Table(headers)) => {
            headers.insert(ACTOR_HEADER, toml_edit::value(value));
        }
        _ => {
            let mut headers = InlineTable::new();
            headers.insert(ACTOR_HEADER, Value::from(value));
            provider.insert("http_headers", Item::Value(Value::InlineTable(headers)));
        }
    }
}

fn remove_actor_marker(doc: &mut DocumentMut, provider_id: &str) -> bool {
    let Ok(provider) = provider_mut(doc, provider_id) else {
        return false;
    };
    let mut remove_headers = false;
    let removed = match provider.get_mut("http_headers") {
        Some(Item::Value(Value::InlineTable(headers))) => {
            let managed = headers.get(ACTOR_HEADER).and_then(Value::as_str) == Some(ACTOR_MARKER);
            if managed {
                headers.remove(ACTOR_HEADER);
                remove_headers = headers.is_empty();
            }
            managed
        }
        Some(Item::Table(headers)) => {
            let managed = headers.get(ACTOR_HEADER).and_then(Item::as_str) == Some(ACTOR_MARKER);
            if managed {
                headers.remove(ACTOR_HEADER);
                remove_headers = headers.is_empty();
            }
            managed
        }
        _ => false,
    };
    if remove_headers {
        provider.remove("http_headers");
    }
    removed
}

fn remove_managed_projection_from_doc(
    doc: &mut DocumentMut,
    provider_id: &str,
    baseline: Option<&ManagedProjectionBaseline>,
) {
    if !remove_actor_marker(doc, provider_id) {
        return;
    }
    if let Some(features) = doc.get_mut("features").and_then(Item::as_table_mut) {
        match baseline.and_then(|baseline| baseline.image_generation.clone()) {
            Some(value) => {
                features.insert("image_generation", value);
            }
            None => {
                features.remove("image_generation");
            }
        }
        if features.is_empty() {
            doc.as_table_mut().remove("features");
        }
    }
    if let Ok(provider) = provider_mut(doc, provider_id) {
        match baseline.and_then(|baseline| baseline.requires_openai_auth.clone()) {
            Some(value) => {
                provider.insert("requires_openai_auth", value);
            }
            None if provider.get("requires_openai_auth").and_then(Item::as_bool) == Some(false) => {
                provider.insert("requires_openai_auth", toml_edit::value(true));
            }
            None => {}
        }
        if let Some(actor_header) = baseline.and_then(|baseline| baseline.actor_header.as_deref()) {
            set_actor_header(provider, actor_header);
        }
    }
}

fn managed_projection_baseline(config_contents: &str) -> Option<ManagedProjectionBaseline> {
    let doc = config_contents.parse::<DocumentMut>().ok()?;
    let provider_id = doc
        .get("model_provider")
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("custom");
    let provider = provider_ref(&doc, provider_id);
    Some(ManagedProjectionBaseline {
        image_generation: doc
            .get("features")
            .and_then(Item::as_table_like)
            .and_then(|features| features.get("image_generation"))
            .cloned(),
        requires_openai_auth: provider
            .and_then(|provider| provider.get("requires_openai_auth"))
            .cloned(),
        actor_header: provider.and_then(actor_header_value),
    })
}

fn actor_header_value(provider: &dyn TableLike) -> Option<String> {
    match provider.get("http_headers") {
        Some(Item::Value(Value::InlineTable(headers))) => headers
            .get(ACTOR_HEADER)
            .and_then(Value::as_str)
            .map(str::to_string),
        Some(Item::Table(headers)) => headers
            .get(ACTOR_HEADER)
            .and_then(Item::as_str)
            .map(str::to_string),
        _ => None,
    }
}

fn actor_marker_is_managed(provider: &dyn TableLike) -> bool {
    match provider.get("http_headers") {
        Some(Item::Value(Value::InlineTable(headers))) => {
            headers.get(ACTOR_HEADER).and_then(Value::as_str) == Some(ACTOR_MARKER)
        }
        Some(Item::Table(headers)) => {
            headers.get(ACTOR_HEADER).and_then(Item::as_str) == Some(ACTOR_MARKER)
        }
        _ => false,
    }
}

fn ensure_trailing_newline(mut contents: String) -> String {
    if !contents.ends_with('\n') {
        contents.push('\n');
    }
    contents
}

fn sanitize_catalog_filename(id: &str) -> String {
    id.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect()
}
