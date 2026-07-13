use std::collections::HashSet;
use std::path::Path;

use anyhow::Context;
use serde_json::{Value, json};
use toml_edit::{DocumentMut, Item, Table};

use super::types::{BackendSettings, RelayMode, RelayProfile, RelayProtocol};

const RELAY_PROVIDER: &str = "custom";
const LEGACY_RELAY_PROVIDERS: &[&str] = &["ChatGPTPlusPlus", "CodexPlusPlus", "CodexPP"];
const CHAT_UPSTREAM_BASE_URL_KEY: &str = "chatgpt_plus_chat_base_url";
const LEGACY_CHAT_UPSTREAM_BASE_URL_KEY: &str = "codex_plus_chat_base_url";
const RESERVED_MODEL_PROVIDER_IDS: &[&str] = &[
    "amazon-bedrock",
    "openai",
    "ollama",
    "lmstudio",
    "oss",
    "ollama-chat",
];
const PROTOCOL_PROXY_PORT: u16 = 57321;

pub(super) fn normalize_settings_config_sections(mut settings: BackendSettings) -> BackendSettings {
    settings.relay_common_config_contents =
        strip_context_config_sections(&settings.relay_common_config_contents);
    settings.relay_context_config_contents.clear();
    for profile in &mut settings.relay_profiles {
        profile.context_selection = Default::default();
        profile.context_selection_initialized = false;
        profile.config_contents = strip_context_config_sections(&profile.config_contents);
    }
    for profile in &mut settings.relay_profiles {
        let _ = normalize_relay_profile_for_storage(profile);
    }
    settings
}

fn split_context_config_sections(config: &str) -> (String, String) {
    let mut common = Vec::new();
    let mut context = Vec::new();
    let mut in_context_table = false;

    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_context_table = is_context_table_header(trimmed);
        }
        if in_context_table {
            context.push(line);
        } else {
            common.push(line);
        }
    }

    (
        normalize_text_config(common.join("\n")),
        normalize_text_config(context.join("\n")),
    )
}

fn strip_context_config_sections(config: &str) -> String {
    match parse_toml_document(config) {
        Ok(mut doc) => {
            for key in ["mcp_servers", "skills", "plugins"] {
                doc.as_table_mut().remove(key);
            }
            normalize_config_text(&doc.to_string())
        }
        Err(_) => split_context_config_sections(config).0,
    }
}

fn is_context_table_header(header: &str) -> bool {
    let path = header.trim_matches(['[', ']']);
    ["mcp_servers", "skills", "plugins"]
        .iter()
        .any(|key| path == *key || path.starts_with(&format!("{key}.")))
}

fn normalize_text_config(contents: String) -> String {
    let trimmed = contents.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{trimmed}\n")
    }
}
pub(super) fn normalize_settings_before_save(mut settings: BackendSettings) -> BackendSettings {
    if let Some(path) =
        crate::app_paths::normalize_codex_app_path(Path::new(&settings.codex_app_path))
    {
        settings.codex_app_path = path.to_string_lossy().to_string();
    }

    settings.relay_common_config_contents =
        sanitize_common_config_contents(&settings.relay_common_config_contents);
    settings.relay_common_config_contents =
        strip_context_config_sections(&settings.relay_common_config_contents);
    settings.relay_context_config_contents.clear();
    for profile in &mut settings.relay_profiles {
        profile.context_selection = Default::default();
        profile.context_selection_initialized = false;
        profile.config_contents = strip_context_config_sections(&profile.config_contents);
    }

    for profile in &mut settings.relay_profiles {
        let _ = normalize_relay_profile_for_storage(profile);
    }

    let common_config = settings.relay_common_config_contents.clone();
    if !common_config.trim().is_empty() {
        for profile in &mut settings.relay_profiles {
            if !profile.use_common_config || profile.config_contents.trim().is_empty() {
                continue;
            }
            profile.config_contents =
                strip_common_config_text_fallback(&profile.config_contents, &common_config);
        }
    }

    settings.provider_sync_saved_providers =
        normalize_provider_sync_provider_list(settings.provider_sync_saved_providers);
    settings.provider_sync_manual_providers =
        normalize_provider_sync_provider_list(settings.provider_sync_manual_providers);
    settings.provider_sync_last_selected_provider = settings
        .provider_sync_last_selected_provider
        .trim()
        .to_string();

    normalize_settings_config_sections(settings)
}

fn normalize_provider_sync_provider_list(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() || trimmed.chars().any(char::is_control) {
            continue;
        }
        if seen.insert(trimmed.to_string()) {
            result.push(trimmed.to_string());
        }
    }
    result.sort();
    result
}

fn strip_common_config_text_fallback(config_contents: &str, common_config: &str) -> String {
    let common = common_config_anchors(common_config);
    if common.root_keys.is_empty() && common.table_headers.is_empty() {
        return ensure_text_newline(config_contents.trim_end().to_string());
    }

    let mut kept = Vec::new();
    let mut skipping_table = false;
    let mut in_root_section = true;
    let mut removed_root_keys = HashSet::new();
    let source_root_keys = toml_root_keys_before_first_table(config_contents);

    for line in config_contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_root_section = false;
            skipping_table = common.table_headers.contains(trimmed);
            if skipping_table {
                continue;
            }
        }

        if skipping_table {
            continue;
        }

        if in_root_section
            && let Some(key) = toml_key_from_line(trimmed)
            && common.root_keys.contains(key)
        {
            let is_duplicate_common_key = removed_root_keys.contains(key)
                || source_root_keys.contains(key)
                || common.table_headers.contains("[features]")
                || common
                    .table_headers
                    .contains("[marketplaces.openai-bundled]")
                || common
                    .table_headers
                    .contains("[plugins.\"superpowers@openai-curated\"]");
            if is_duplicate_common_key {
                removed_root_keys.insert(key.to_string());
                continue;
            }
        }

        kept.push(line);
    }

    ensure_text_newline(kept.join("\n").trim_end().to_string())
}

fn toml_root_keys_before_first_table(config_contents: &str) -> HashSet<String> {
    let mut keys = HashSet::new();
    for line in config_contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            break;
        }
        if let Some(key) = toml_key_from_line(trimmed) {
            keys.insert(key.to_string());
        }
    }
    keys
}

struct CommonConfigAnchors {
    root_keys: HashSet<String>,
    table_headers: HashSet<String>,
}

fn common_config_anchors(common_config: &str) -> CommonConfigAnchors {
    let mut root_keys = HashSet::new();
    let mut table_headers = HashSet::new();
    let mut in_table = false;

    for line in common_config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_table = true;
            table_headers.insert(trimmed.to_string());
            continue;
        }
        if !in_table && let Some(key) = toml_key_from_line(trimmed) {
            root_keys.insert(key.to_string());
        }
    }

    CommonConfigAnchors {
        root_keys,
        table_headers,
    }
}

fn toml_key_from_line(line: &str) -> Option<&str> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }
    let (key, _) = trimmed.split_once('=')?;
    let key = key.trim();
    if key.is_empty() { None } else { Some(key) }
}

fn ensure_text_newline(mut value: String) -> String {
    if !value.is_empty() && !value.ends_with('\n') {
        value.push('\n');
    }
    value
}

fn normalize_config_text(contents: &str) -> String {
    let mut seen_root_keys = HashSet::new();
    let mut seen_headers = HashSet::new();
    let mut kept = Vec::new();
    let mut skipping_duplicate_table = false;
    let mut in_root = true;

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_root = false;
            skipping_duplicate_table = !seen_headers.insert(trimmed.to_string());
            if !skipping_duplicate_table {
                kept.push(line);
            }
            continue;
        }
        if skipping_duplicate_table {
            continue;
        }
        if in_root
            && !trimmed.is_empty()
            && !trimmed.starts_with('#')
            && let Some((key, _)) = trimmed.split_once('=')
        {
            let key = key.trim();
            if !key.is_empty() && !key.contains('.') && !seen_root_keys.insert(key.to_string()) {
                continue;
            }
        }
        kept.push(line);
    }

    normalize_text_config(kept.join("\n"))
}

fn sanitize_common_config_contents(common_config: &str) -> String {
    let mut kept = Vec::new();
    let mut in_root = true;
    let mut skipping_model_providers = false;

    for line in common_config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_root = false;
            skipping_model_providers =
                trimmed == "[model_providers]" || trimmed.starts_with("[model_providers.");
            if skipping_model_providers {
                continue;
            }
        } else if skipping_model_providers {
            continue;
        }

        if in_root
            && let Some((key, _)) = trimmed.split_once('=')
            && matches!(
                key.trim(),
                "model"
                    | "model_provider"
                    | "base_url"
                    | "model_catalog_json"
                    | CHAT_UPSTREAM_BASE_URL_KEY
                    | LEGACY_CHAT_UPSTREAM_BASE_URL_KEY
            )
        {
            continue;
        }
        kept.push(line);
    }

    normalize_config_text(&kept.join("\n"))
}

fn normalize_relay_profile_for_storage(profile: &mut RelayProfile) -> anyhow::Result<()> {
    if profile.model_windows.trim().is_empty() && profile.model_list.contains('[') {
        let (clean_list, windows) =
            crate::model_suffix::migrate_model_list_with_suffixes(&profile.model_list);
        profile.model_list = clean_list;
        profile.model_windows = serde_json::to_string(&windows).unwrap_or_default();
    }

    if profile.relay_mode == RelayMode::Official && !profile.official_mix_api_key {
        let has_api_config = !profile.base_url.trim().is_empty()
            || !profile.api_key.trim().is_empty()
            || auth_api_key(&profile.auth_contents).is_some()
            || config_has_model_provider(&profile.config_contents);
        if has_api_config {
            profile.config_contents.clear();
        }
        if !profile.model_list.trim().is_empty() {
            profile.model_list = merge_model_into_model_list(&profile.model, &profile.model_list);
        }
        profile.model.clear();
        profile.base_url.clear();
        profile.upstream_base_url.clear();
        profile.api_key.clear();
        if auth_contents_looks_like_chatgpt_auth(&profile.auth_contents) {
            profile.auth_contents =
                remove_openai_api_key_from_auth_contents(&profile.auth_contents)?;
        } else {
            profile.auth_contents.clear();
        }
        return Ok(());
    }

    let source_base_url = relay_profile_base_url(profile);
    let source_api_key = relay_profile_api_key(profile);
    if !profile.config_contents.trim().is_empty()
        || profile.relay_mode == RelayMode::PureApi
        || profile.official_mix_api_key
    {
        profile.config_contents = complete_relay_profile_config(profile)?;
    }
    if profile.relay_mode == RelayMode::PureApi
        && profile.auth_contents.trim().is_empty()
        && !source_api_key.trim().is_empty()
    {
        profile.auth_contents = serde_json::to_string_pretty(&json!({
            "OPENAI_API_KEY": source_api_key.trim()
        }))?;
    }
    if profile.relay_mode == RelayMode::Official {
        profile.auth_contents = remove_openai_api_key_from_auth_contents(&profile.auth_contents)?;
    }
    profile.model = relay_profile_model(profile);
    profile.model_list = merge_model_into_model_list(&profile.model, &profile.model_list);
    profile.upstream_base_url = source_base_url.clone();
    profile.base_url = source_base_url;
    profile.api_key = relay_profile_api_key(profile);
    Ok(())
}

fn relay_profile_model(profile: &RelayProfile) -> String {
    root_key_string(&profile.config_contents, "model")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| profile.model.trim().to_string())
}

fn relay_profile_base_url(profile: &RelayProfile) -> String {
    if profile.relay_mode == RelayMode::Aggregate {
        return local_proxy_base_url();
    }
    if profile.protocol == RelayProtocol::ChatCompletions {
        if !profile.upstream_base_url.trim().is_empty() {
            return profile.upstream_base_url.trim().to_string();
        }
        if let Some(value) = root_key_string(&profile.config_contents, CHAT_UPSTREAM_BASE_URL_KEY)
            .or_else(|| {
                root_key_string(&profile.config_contents, LEGACY_CHAT_UPSTREAM_BASE_URL_KEY)
            })
            .filter(|value| !value.trim().is_empty())
        {
            return value;
        }
        if !profile.base_url.trim().is_empty() {
            return profile.base_url.trim().to_string();
        }
    }
    let provider_base_url = provider_string_from_config(&profile.config_contents, "base_url")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_default();
    if profile.protocol == RelayProtocol::ChatCompletions
        && provider_base_url == local_proxy_base_url()
    {
        String::new()
    } else if !provider_base_url.is_empty() {
        provider_base_url
    } else {
        profile.base_url.trim().to_string()
    }
}

fn relay_profile_api_key(profile: &RelayProfile) -> String {
    if profile.relay_mode == RelayMode::Aggregate {
        return "chatgpt-plus-aggregate".to_string();
    }
    if profile.relay_mode == RelayMode::Official {
        return experimental_bearer_token_from_config(&profile.config_contents)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| profile.api_key.trim().to_string());
    }
    auth_api_key(&profile.auth_contents)
        .or_else(|| experimental_bearer_token_from_config(&profile.config_contents))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| profile.api_key.trim().to_string())
}

fn complete_relay_profile_config(profile: &RelayProfile) -> anyhow::Result<String> {
    let mut doc = parse_toml_document(&profile.config_contents)?;
    let provider_id = active_or_default_provider_id(&doc);
    doc["model_provider"] = toml_edit::value(provider_id.as_str());

    let mut model = relay_profile_model(profile);
    if model.trim().is_empty()
        && let Some(first) = profile
            .model_list
            .split(['\r', '\n', ','])
            .map(str::trim)
            .find(|value| !value.is_empty())
    {
        model = crate::model_suffix::parse_model_suffix(first).0;
    }
    let (model, _) = crate::model_suffix::parse_model_suffix(&model);
    if !model.trim().is_empty() {
        doc["model"] = toml_edit::value(model.trim());
    }

    let base_url = relay_profile_base_url(profile);
    let api_key = relay_profile_api_key(profile);
    doc.as_table_mut().remove(CHAT_UPSTREAM_BASE_URL_KEY);
    doc.as_table_mut().remove(LEGACY_CHAT_UPSTREAM_BASE_URL_KEY);
    retain_only_provider_table(&mut doc, &provider_id);
    for legacy_provider in LEGACY_RELAY_PROVIDERS {
        if provider_id != *legacy_provider {
            remove_provider_table(&mut doc, legacy_provider);
        }
    }
    let provider = ensure_provider_table(&mut doc, &provider_id)?;
    if provider
        .get("name")
        .and_then(Item::as_str)
        .map(str::trim)
        .is_none_or(str::is_empty)
    {
        provider["name"] = toml_edit::value(provider_id.as_str());
    }
    if provider
        .get("wire_api")
        .and_then(Item::as_str)
        .map(str::trim)
        .is_none_or(str::is_empty)
    {
        provider["wire_api"] = toml_edit::value("responses");
    }
    if provider
        .get("requires_openai_auth")
        .and_then(Item::as_bool)
        .is_none()
    {
        provider["requires_openai_auth"] = toml_edit::value(true);
    }
    let provider_base_url = match profile.protocol {
        RelayProtocol::Responses => base_url,
        RelayProtocol::ChatCompletions => local_proxy_base_url(),
    };
    if !provider_base_url.trim().is_empty() {
        provider["base_url"] = toml_edit::value(provider_base_url.trim());
    }
    if profile.relay_mode == RelayMode::PureApi {
        provider.remove("experimental_bearer_token");
    } else if !api_key.trim().is_empty() {
        provider["experimental_bearer_token"] = toml_edit::value(api_key.trim());
    }

    Ok(move_model_providers_before_profiles(&ensure_text_newline(
        doc.to_string(),
    )))
}

fn auth_api_key(auth_contents: &str) -> Option<String> {
    let auth: Value = serde_json::from_str(auth_contents).ok()?;
    auth.get("OPENAI_API_KEY")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(ToString::to_string)
}

fn remove_openai_api_key_from_auth_contents(auth_contents: &str) -> anyhow::Result<String> {
    if auth_contents.trim().is_empty() {
        return Ok(String::new());
    }
    let mut value =
        serde_json::from_str::<Value>(auth_contents).context("auth.json JSON 解析失败")?;
    let Some(object) = value.as_object_mut() else {
        anyhow::bail!("auth.json 必须是 JSON 对象");
    };
    object.remove("OPENAI_API_KEY");
    if object.is_empty() {
        return Ok(String::new());
    }
    Ok(format!("{}\n", serde_json::to_string_pretty(&value)?))
}

fn merge_model_into_model_list(model: &str, model_list: &str) -> String {
    let model = model.trim();
    let mut models = Vec::new();
    if !model.is_empty() {
        models.push(model.to_string());
    }
    for item in model_list.split(['\r', '\n', ',']).map(str::trim) {
        if !item.is_empty() && !models.iter().any(|existing| existing == item) {
            models.push(item.to_string());
        }
    }
    models.join("\n")
}

fn config_has_model_provider(config_contents: &str) -> bool {
    parse_toml_document(config_contents)
        .ok()
        .and_then(|doc| {
            doc.get("model_provider")
                .and_then(Item::as_str)
                .map(str::to_string)
        })
        .is_some_and(|value| !value.trim().is_empty())
}

fn auth_contents_looks_like_chatgpt_auth(contents: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(contents) else {
        return false;
    };
    value
        .get("auth_mode")
        .and_then(Value::as_str)
        .is_some_and(|mode| mode.eq_ignore_ascii_case("chatgpt"))
        && value.get("tokens").is_some_and(|tokens| {
            ["access_token", "id_token", "refresh_token"]
                .iter()
                .any(|key| {
                    tokens
                        .get(*key)
                        .and_then(Value::as_str)
                        .is_some_and(|token| !token.trim().is_empty())
                })
        })
}

fn root_key_string(contents: &str, key: &str) -> Option<String> {
    let doc = parse_toml_document(contents).ok()?;
    doc.get(key)
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn provider_string_from_config(config_contents: &str, key: &str) -> Option<String> {
    let doc = parse_toml_document(config_contents).ok()?;
    if let Some(provider_id) = active_provider_id(&doc)
        && let Some(value) = doc
            .get("model_providers")
            .and_then(Item::as_table)
            .and_then(|providers| providers.get(&provider_id))
            .and_then(Item::as_table)
            .and_then(|provider| provider.get(key))
            .and_then(Item::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
    {
        return Some(value.to_string());
    }
    doc.get("model_providers")
        .and_then(Item::as_table)
        .and_then(|providers| {
            providers.iter().find_map(|(_, item)| {
                item.as_table_like()
                    .and_then(|provider| provider.get(key))
                    .and_then(Item::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string)
            })
        })
}

fn experimental_bearer_token_from_config(config_contents: &str) -> Option<String> {
    let doc = parse_toml_document(config_contents).ok()?;
    let provider_id = active_provider_id(&doc)?;
    doc.get("model_providers")
        .and_then(Item::as_table)
        .and_then(|providers| providers.get(&provider_id))
        .and_then(Item::as_table)
        .and_then(|provider| provider.get("experimental_bearer_token"))
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(ToString::to_string)
}

fn active_provider_id(doc: &DocumentMut) -> Option<String> {
    doc.get("model_provider")
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|provider| !provider.is_empty())
        .map(ToString::to_string)
}

fn active_or_default_provider_id(doc: &DocumentMut) -> String {
    active_provider_id(doc)
        .filter(|provider| {
            !provider.is_empty()
                && !RESERVED_MODEL_PROVIDER_IDS.contains(&provider.as_str())
                && !LEGACY_RELAY_PROVIDERS.contains(&provider.as_str())
        })
        .unwrap_or_else(|| RELAY_PROVIDER.to_string())
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

fn table_mut_or_insert<'a>(doc: &'a mut DocumentMut, key: &str) -> anyhow::Result<&'a mut Table> {
    if !doc.as_table().contains_key(key) || doc.get(key).and_then(Item::as_table).is_none() {
        doc[key] = toml_edit::table();
    }
    doc.get_mut(key)
        .and_then(Item::as_table_mut)
        .ok_or_else(|| anyhow::anyhow!("{key} 必须是 TOML table"))
}

fn ensure_provider_table<'a>(
    doc: &'a mut DocumentMut,
    provider_id: &str,
) -> anyhow::Result<&'a mut Table> {
    let providers = table_mut_or_insert(doc, "model_providers")?;
    if !providers.contains_key(provider_id)
        || providers
            .get(provider_id)
            .and_then(Item::as_table)
            .is_none()
    {
        providers.insert(provider_id, toml_edit::table());
    }
    providers
        .get_mut(provider_id)
        .and_then(Item::as_table_mut)
        .ok_or_else(|| anyhow::anyhow!("model_providers.{provider_id} 必须是 TOML table"))
}

fn remove_provider_table(doc: &mut DocumentMut, provider_id: &str) {
    if let Some(providers) = doc.get_mut("model_providers").and_then(Item::as_table_mut) {
        providers.remove(provider_id);
        if providers.is_empty() {
            doc.as_table_mut().remove("model_providers");
        }
    }
}

fn retain_only_provider_table(doc: &mut DocumentMut, provider_id: &str) {
    if let Some(providers) = doc.get_mut("model_providers").and_then(Item::as_table_mut) {
        let provider = providers
            .remove(provider_id)
            .unwrap_or_else(toml_edit::table);
        providers.clear();
        providers.insert(provider_id, provider);
    }
}

fn move_model_providers_before_profiles(contents: &str) -> String {
    let lines = contents.lines().collect::<Vec<_>>();
    let Some(provider_start) = lines
        .iter()
        .position(|line| line.trim_start().starts_with("[model_providers."))
    else {
        return ensure_text_newline(contents.to_string());
    };
    let provider_end = lines[provider_start + 1..]
        .iter()
        .position(|line| line.trim_start().starts_with('['))
        .map(|offset| provider_start + 1 + offset)
        .unwrap_or(lines.len());
    let Some(profile_start) = lines
        .iter()
        .position(|line| line.trim_start().starts_with("[profiles."))
    else {
        return ensure_text_newline(contents.to_string());
    };
    if provider_start < profile_start {
        return ensure_text_newline(contents.to_string());
    }

    let mut output = Vec::with_capacity(lines.len());
    output.extend_from_slice(&lines[..profile_start]);
    output.extend_from_slice(&lines[provider_start..provider_end]);
    if output.last().is_some_and(|line| !line.trim().is_empty()) {
        output.push("");
    }
    output.extend_from_slice(&lines[profile_start..provider_start]);
    output.extend_from_slice(&lines[provider_end..]);
    ensure_text_newline(output.join("\n"))
}

fn local_proxy_base_url() -> String {
    format!("http://127.0.0.1:{PROTOCOL_PROXY_PORT}/v1")
}
