use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use anyhow::Context;
use serde_json::{Map, Value};
use toml_edit::{DocumentMut, Item};

use super::migration::normalize_settings_config_sections;
use super::types::{
    BackendSettings, RelayMode, RelayProfile, default_relay_test_model, normalize_codex_extra_args,
};
use crate::atomic_file;

#[derive(Debug, Clone)]
pub struct SettingsStore {
    path: PathBuf,
}

pub(crate) struct RawSettingsSnapshot {
    contents: Option<Vec<u8>>,
}

impl Default for SettingsStore {
    fn default() -> Self {
        Self::new(crate::paths::default_settings_path())
    }
}

impl SettingsStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> anyhow::Result<BackendSettings> {
        let contents = match fs::read_to_string(&self.path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(BackendSettings::default());
            }
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("failed to read settings {}", self.path.display()));
            }
        };

        Ok(normalize_settings_config_sections(
            serde_json::from_str(&contents).unwrap_or_default(),
        ))
    }

    pub(crate) fn capture_raw_snapshot(&self) -> anyhow::Result<RawSettingsSnapshot> {
        let contents = match fs::read(&self.path) {
            Ok(contents) => Some(contents),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("failed to snapshot settings {}", self.path.display())
                });
            }
        };
        Ok(RawSettingsSnapshot { contents })
    }

    pub(crate) fn restore_raw_snapshot(
        &self,
        snapshot: &RawSettingsSnapshot,
    ) -> anyhow::Result<()> {
        match snapshot.contents.as_deref() {
            Some(contents) => atomic_file::write(&self.path, contents),
            None => match fs::remove_file(&self.path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(error)
                    .with_context(|| format!("failed to remove settings {}", self.path.display())),
            },
        }
    }

    pub fn save(&self, settings: &BackendSettings) -> anyhow::Result<()> {
        let mut settings = normalize_settings_config_sections(settings.clone());
        settings.codex_extra_args = normalize_codex_extra_args(&settings.codex_extra_args);
        let bytes = serde_json::to_vec_pretty(&settings)?;
        atomic_file::write(&self.path, &bytes)
    }

    pub fn update(&self, payload: Value) -> anyhow::Result<BackendSettings> {
        let Value::Object(payload) = payload else {
            return self.load();
        };

        let mut raw = self.load_raw_object()?;
        merge_known_setting_fields(&mut raw, &payload);
        let settings = normalize_settings_config_sections(
            serde_json::from_value(Value::Object(raw.clone())).unwrap_or_default(),
        );
        raw.insert(
            "relayCommonConfigContents".to_string(),
            Value::String(settings.relay_common_config_contents.clone()),
        );
        raw.remove("relayContextConfigContents");
        if let Some(profiles) = raw.get_mut("relayProfiles").and_then(Value::as_array_mut) {
            for profile in profiles {
                if let Some(profile) = profile.as_object_mut() {
                    profile.remove("contextSelection");
                    profile.remove("contextSelectionInitialized");
                }
            }
        }
        let bytes = serde_json::to_vec_pretty(&Value::Object(raw))?;
        atomic_file::write(&self.path, &bytes)?;
        Ok(settings)
    }

    fn load_raw_object(&self) -> anyhow::Result<Map<String, Value>> {
        let contents = match fs::read_to_string(&self.path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(settings_to_object(&BackendSettings::default()));
            }
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("failed to read settings {}", self.path.display()));
            }
        };

        match serde_json::from_str::<Value>(&contents) {
            Ok(Value::Object(map)) => Ok(map),
            Ok(_) | Err(_) => Ok(settings_to_object(&BackendSettings::default())),
        }
    }
}

fn merge_known_setting_fields(target: &mut Map<String, Value>, source: &Map<String, Value>) {
    if let Some(value) = source.get("codexAppPath").and_then(Value::as_str) {
        target.insert("codexAppPath".to_string(), Value::String(value.to_string()));
    }
    if let Some(value) = source.get("codexExtraArgs").and_then(Value::as_array) {
        let args = value
            .iter()
            .filter_map(Value::as_str)
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        target.insert(
            "codexExtraArgs".to_string(),
            Value::Array(
                normalize_codex_extra_args(&args)
                    .into_iter()
                    .map(Value::String)
                    .collect(),
            ),
        );
    }
    if let Some(value) = source.get("providerSyncEnabled").and_then(Value::as_bool) {
        target.insert("providerSyncEnabled".to_string(), Value::Bool(value));
    }
    if let Some(value) = source.get("relayProfilesEnabled").and_then(Value::as_bool) {
        target.insert("relayProfilesEnabled".to_string(), Value::Bool(value));
    }
    if let Some(value) = source
        .get("computerUseGuardEnabled")
        .and_then(Value::as_bool)
    {
        target.insert("computerUseGuardEnabled".to_string(), Value::Bool(value));
    }
    merge_bool_setting(target, source, "codexAppFastStartup");
    if let Some(value) = source.get("relayBaseUrl").and_then(Value::as_str) {
        target.insert("relayBaseUrl".to_string(), Value::String(value.to_string()));
    }
    if let Some(value) = source.get("relayApiKey").and_then(Value::as_str) {
        target.insert("relayApiKey".to_string(), Value::String(value.to_string()));
    }
    if let Some(value) = source.get("relayProfiles").and_then(Value::as_array) {
        let mut profiles = serde_json::from_value::<Vec<RelayProfile>>(Value::Array(value.clone()))
            .unwrap_or_default();
        preserve_official_mix_bearer_tokens(&mut profiles, target);
        target.insert(
            "relayProfiles".to_string(),
            serde_json::to_value(profiles).unwrap_or_else(|_| Value::Array(Vec::new())),
        );
    }
    if let Some(value) = source
        .get("relayCommonConfigContents")
        .and_then(Value::as_str)
    {
        target.insert(
            "relayCommonConfigContents".to_string(),
            Value::String(value.to_string()),
        );
    }
    if let Some(value) = source.get("activeRelayId").and_then(Value::as_str) {
        target.insert(
            "activeRelayId".to_string(),
            Value::String(value.to_string()),
        );
    }
    if let Some(value) = source
        .get("aggregateRelayProfiles")
        .and_then(Value::as_array)
    {
        target.insert(
            "aggregateRelayProfiles".to_string(),
            Value::Array(value.clone()),
        );
    }
    if let Some(value) = source.get("activeAggregateRelayId").and_then(Value::as_str) {
        target.insert(
            "activeAggregateRelayId".to_string(),
            Value::String(value.to_string()),
        );
    }
    if let Some(value) = source.get("relayTestModel").and_then(Value::as_str) {
        target.insert(
            "relayTestModel".to_string(),
            Value::String(if value.trim().is_empty() {
                default_relay_test_model()
            } else {
                value.trim().to_string()
            }),
        );
    }
}

fn merge_bool_setting(target: &mut Map<String, Value>, source: &Map<String, Value>, key: &str) {
    if let Some(value) = source.get(key).and_then(Value::as_bool) {
        target.insert(key.to_string(), Value::Bool(value));
    }
}

fn preserve_official_mix_bearer_tokens(
    profiles: &mut [RelayProfile],
    previous: &Map<String, Value>,
) {
    let previous_tokens = previous
        .get("relayProfiles")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|value| serde_json::from_value::<RelayProfile>(value.clone()).ok())
        .filter_map(|profile| {
            if profile.relay_mode != RelayMode::Official || !profile.official_mix_api_key {
                return None;
            }
            let token = experimental_bearer_token_from_config_text(&profile.config_contents)?;
            Some((profile.id, token))
        })
        .collect::<HashMap<_, _>>();

    for profile in profiles {
        if profile.relay_mode != RelayMode::Official || !profile.official_mix_api_key {
            continue;
        }
        if experimental_bearer_token_from_config_text(&profile.config_contents).is_some() {
            continue;
        }
        let token = if profile.api_key.trim().is_empty() {
            previous_tokens.get(&profile.id).cloned()
        } else {
            Some(profile.api_key.trim().to_string())
        };
        let Some(token) = token else {
            continue;
        };
        profile.config_contents =
            set_or_replace_experimental_bearer_token(&profile.config_contents, &token);
    }
}

fn set_or_replace_experimental_bearer_token(contents: &str, token: &str) -> String {
    let mut doc = parse_toml_document(contents).unwrap_or_else(|_| DocumentMut::new());
    let provider_id = active_provider_id(&doc).unwrap_or_else(|| "chatgpt-plus-relay".to_string());
    doc["model_provider"] = toml_edit::value(provider_id.as_str());
    doc["model_providers"][provider_id.as_str()]["experimental_bearer_token"] =
        toml_edit::value(token.trim());
    ensure_text_newline(doc.to_string())
}

fn ensure_text_newline(mut value: String) -> String {
    if !value.is_empty() && !value.ends_with('\n') {
        value.push('\n');
    }
    value
}

fn experimental_bearer_token_from_config_text(contents: &str) -> Option<String> {
    let doc = parse_toml_document(contents).ok()?;
    let provider_id = active_provider_id(&doc)?;
    doc.get("model_providers")
        .and_then(Item::as_table)
        .and_then(|providers| providers.get(&provider_id))
        .and_then(Item::as_table)
        .and_then(|provider| provider.get("experimental_bearer_token"))
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn active_provider_id(doc: &DocumentMut) -> Option<String> {
    doc.get("model_provider")
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|provider| !provider.is_empty())
        .map(ToString::to_string)
}

fn parse_toml_document(contents: &str) -> anyhow::Result<DocumentMut> {
    let contents = contents.trim_start_matches('\u{feff}');
    if contents.trim().is_empty() {
        Ok(DocumentMut::new())
    } else {
        contents
            .parse::<DocumentMut>()
            .map_err(|error| anyhow::anyhow!("config.toml TOML 解析失败：{error}"))
    }
}

pub(super) fn settings_to_object(settings: &BackendSettings) -> Map<String, Value> {
    match serde_json::to_value(settings).unwrap_or_else(|_| Value::Object(Map::new())) {
        Value::Object(map) => map,
        _ => Map::new(),
    }
}
