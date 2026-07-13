//! 旧 model_list 后缀语法解析与小型模型声明迁移。
//!
//! 后缀语法：`deepseek-v4-pro[1M]` 表示 slug=deepseek-v4-pro、context_window=1000000。
//! 单位 K/k=1000、M/m=1000000；纯数字也接受。后缀在生成 catalog 时剥离。

use std::collections::{HashMap, HashSet};

use crate::model_catalog_materializer::CustomModelSpec;

/// 解析单个模型条目的后缀，返回 (slug, 可选窗口)。
/// 括号内非合法窗口 token 时，整串作为 slug 且 window=None（不剥离括号）。
pub fn parse_model_suffix(raw: &str) -> (String, Option<u64>) {
    let raw = raw.trim();
    if let Some(close) = raw.rfind(']') {
        // 仅当 ] 是最后一个字符时才视为后缀
        if close == raw.len() - 1 {
            if let Some(open) = raw[..close].rfind('[') {
                let inner = raw[open + 1..close].trim();
                let slug = raw[..open].trim();
                if !slug.is_empty() {
                    if let Some(window) = parse_window_token(inner) {
                        return (slug.to_string(), Some(window));
                    }
                }
            }
        }
    }
    (raw.to_string(), None)
}

/// 一次性迁移：把旧格式 `slug[suffix]` 的 model_list 拆成无后缀列表和窗口 map。
pub fn migrate_model_list_with_suffixes(model_list: &str) -> (String, HashMap<String, String>) {
    let mut clean_lines = Vec::new();
    let mut windows = HashMap::new();
    for raw in model_list
        .split(['\r', '\n', ','])
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let (slug, window) = parse_model_suffix(raw);
        clean_lines.push(slug.clone());
        if let Some(window) = window {
            windows.insert(slug, window.to_string());
        }
    }
    (clean_lines.join("\n"), windows)
}

/// 解析括号内的窗口 token，如 "1M" / "200K" / "1000000"。非法或 0 返回 None。
fn parse_window_token(token: &str) -> Option<u64> {
    let token = token.trim();
    if token.is_empty() {
        return None;
    }
    let (num_part, multiplier) = match token.chars().last() {
        Some('K' | 'k') => (&token[..token.len() - 1], 1_000u64),
        Some('M' | 'm') => (&token[..token.len() - 1], 1_000_000u64),
        Some(_) => (token, 1u64),
        None => return None,
    };
    num_part
        .trim()
        .parse::<u64>()
        .ok()
        .map(|value| value * multiplier)
        .filter(|value| *value > 0)
}

/// 将兼容字段和规范化声明合并成 materializer 的小型模型声明。
/// 当前模型排在最前；逐模型窗口和 reasoning 优先于顶层窗口。
pub fn collect_custom_model_specs(
    model_list: &str,
    model_windows: &HashMap<String, String>,
    stored_specs: &[CustomModelSpec],
    current_model: &str,
    fallback_window: Option<u64>,
) -> Vec<CustomModelSpec> {
    let stored_by_id = stored_specs
        .iter()
        .filter(|spec| !spec.id.trim().is_empty())
        .map(|spec| (spec.id.trim().to_string(), spec))
        .collect::<HashMap<_, _>>();
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    let current = parse_model_suffix(current_model).0;
    if !current.is_empty() && seen.insert(current.clone()) {
        ids.push(current);
    }
    for raw in model_list
        .split(['\r', '\n', ','])
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let id = parse_model_suffix(raw).0;
        if !id.is_empty() && seen.insert(id.clone()) {
            ids.push(id);
        }
    }
    for spec in stored_specs {
        let id = spec.id.trim();
        if !id.is_empty() && seen.insert(id.to_string()) {
            ids.push(id.to_string());
        }
    }

    ids.into_iter()
        .map(|id| {
            let stored = stored_by_id.get(&id).copied();
            let context_window = model_windows
                .get(&id)
                .and_then(|window| parse_window_token(window))
                .or_else(|| stored.and_then(|spec| spec.context_window))
                .or(fallback_window);
            CustomModelSpec {
                id,
                context_window,
                reasoning: stored.and_then(|spec| spec.reasoning.clone()),
            }
        })
        .collect()
}

pub fn legacy_fields_from_model_specs(
    specs: &[CustomModelSpec],
) -> (String, HashMap<String, String>) {
    let mut ids = Vec::new();
    let mut windows = HashMap::new();
    let mut seen = HashSet::new();
    for spec in specs {
        let id = spec.id.trim();
        if id.is_empty() || !seen.insert(id.to_string()) {
            continue;
        }
        ids.push(id.to_string());
        if let Some(window) = spec.context_window.filter(|window| *window > 0) {
            windows.insert(id.to_string(), window.to_string());
        }
    }
    (ids.join("\n"), windows)
}
