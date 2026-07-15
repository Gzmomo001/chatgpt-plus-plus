use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use chatgpt_plus_core::settings::SettingsStore;
use serde::Serialize;
use serde_json::{Value, json};

use super::shared::{CommandResult, failed, ok};

const REDACTED: &str = "[REDACTED]";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvConflictsPayload {
    pub conflicts: Vec<chatgpt_plus_core::env_conflicts::EnvConflict>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveEnvConflictsRequest {
    pub names: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveEnvConflictsPayload {
    pub removed: Vec<chatgpt_plus_core::env_conflicts::EnvConflictRemoval>,
    pub backup_path: Option<String>,
    pub remaining: Vec<chatgpt_plus_core::env_conflicts::EnvConflict>,
}
#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticsPayload {
    pub report: String,
}
#[derive(Debug, Clone, Serialize)]
pub struct LogFolderPayload {
    pub path: String,
}

#[tauri::command]
pub fn open_log_folder() -> CommandResult<LogFolderPayload> {
    let path = chatgpt_plus_core::paths::default_app_state_dir();
    let payload = LogFolderPayload {
        path: path.to_string_lossy().to_string(),
    };
    let result = fs::create_dir_all(&path)
        .map_err(anyhow::Error::from)
        .and_then(|_| open_path_in_file_manager(&path));
    match result {
        Ok(()) => ok("日志文件夹已打开。", payload),
        Err(error) => failed(&format!("打开日志文件夹失败：{error}"), payload),
    }
}

#[tauri::command]
pub fn copy_diagnostics() -> CommandResult<DiagnosticsPayload> {
    ok(
        "诊断报告已生成。",
        DiagnosticsPayload {
            report: diagnostics_report(),
        },
    )
}

#[tauri::command]
pub fn check_env_conflicts() -> CommandResult<EnvConflictsPayload> {
    let conflicts = chatgpt_plus_core::env_conflicts::detect_env_conflicts();
    let message = if conflicts.is_empty() {
        "未检测到会覆盖 Codex 供应商配置的 OPENAI 环境变量。"
    } else {
        "检测到可能覆盖 Codex 供应商配置的 OPENAI 环境变量。"
    };
    ok(message, EnvConflictsPayload { conflicts })
}

#[tauri::command]
pub fn remove_env_conflicts(
    request: RemoveEnvConflictsRequest,
) -> CommandResult<RemoveEnvConflictsPayload> {
    let backup_dir = chatgpt_plus_core::paths::default_app_state_dir().join("backups");
    match chatgpt_plus_core::env_conflicts::remove_env_conflicts(&request.names, backup_dir) {
        Ok(result) => {
            let remaining = chatgpt_plus_core::env_conflicts::detect_env_conflicts();
            ok(
                "环境变量已按确认项删除；重新启动 Codex 后生效。",
                RemoveEnvConflictsPayload {
                    removed: result.removed,
                    backup_path: result.backup_path,
                    remaining,
                },
            )
        }
        Err(error) => failed(
            &format!("删除环境变量失败：{error}"),
            RemoveEnvConflictsPayload {
                removed: Vec::new(),
                backup_path: None,
                remaining: chatgpt_plus_core::env_conflicts::detect_env_conflicts(),
            },
        ),
    }
}

#[tauri::command]
pub fn write_diagnostic_event(event: String, detail: Value) -> CommandResult<Value> {
    let event = sanitize_manager_event(&event);
    if !chatgpt_plus_core::diagnostic_log::diagnostic_log_enabled() {
        return ok("日志功能已关闭，未写入。", json!({}));
    }
    match chatgpt_plus_core::diagnostic_log::append_diagnostic_log(&event, detail) {
        Ok(()) => ok("诊断日志已写入。", json!({})),
        Err(error) => failed(&format!("写入诊断日志失败：{error}"), json!({})),
    }
}

pub(super) fn sanitize_manager_event(event: &str) -> String {
    let suffix = event
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let suffix = suffix.trim_matches(['.', '_', '-']).trim();
    if suffix.is_empty() {
        "manager.ui.event".to_string()
    } else if suffix.starts_with("manager.") {
        suffix.to_string()
    } else {
        format!("manager.ui.{suffix}")
    }
}
pub(super) fn diagnostics_report() -> String {
    let overview = ok("概览已加载。", crate::overview::load_overview_payload());
    let settings = SettingsStore::default().load().unwrap_or_default();
    let generated_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let mut report = json!({
        "generatedAtMs": generated_at_ms,
        "version": chatgpt_plus_core::version::VERSION,
        "overview": overview.payload,
        "settings": settings,
        "logs": {
            "diagnosticLogPath": chatgpt_plus_core::paths::default_diagnostic_log_path(),
            "latestStatusPath": chatgpt_plus_core::paths::default_latest_status_path()
        },
        "platform": {
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH
        }
    });
    redact_sensitive_values(&mut report);
    if let Some(home_dir) = diagnostic_home_dir() {
        redact_home_paths(&mut report, &home_dir);
    }
    serde_json::to_string_pretty(&report)
        .unwrap_or_else(|error| format!("诊断报告序列化失败：{error}"))
}

fn diagnostic_home_dir() -> Option<PathBuf> {
    chatgpt_plus_core::paths::default_app_state_dir()
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .or_else(|| {
            std::env::var_os("HOME")
                .or_else(|| std::env::var_os("USERPROFILE"))
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
        })
}

fn redact_sensitive_values(value: &mut Value) {
    match value {
        Value::Array(values) => {
            for value in values {
                redact_sensitive_values(value);
            }
        }
        Value::Object(values) => {
            for (key, value) in values {
                if is_sensitive_field(key) && !matches!(value, Value::Bool(_)) {
                    *value = Value::String(REDACTED.to_string());
                } else {
                    redact_sensitive_values(value);
                }
            }
        }
        Value::String(value) if contains_sensitive_text(value) => {
            *value = REDACTED.to_string();
        }
        _ => {}
    }
}

fn is_sensitive_field(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect::<String>();

    matches!(
        normalized.as_str(),
        "authorization"
            | "cookie"
            | "credentials"
            | "credential"
            | "password"
            | "passwd"
            | "proxyauthorization"
            | "setcookie"
            | "token"
            | "tokens"
    ) || normalized.ends_with("apikey")
        || normalized.ends_with("accesstoken")
        || normalized.ends_with("authorization")
        || normalized.ends_with("bearertoken")
        || normalized.ends_with("configcontents")
        || normalized.ends_with("authcontents")
        || normalized.ends_with("idtoken")
        || normalized.ends_with("privatekey")
        || normalized.ends_with("refreshtoken")
        || normalized.ends_with("secret")
}

fn contains_sensitive_text(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    [
        "authorization",
        "bearer ",
        "api-key",
        "api_key",
        "apikey",
        "access-token",
        "access_token",
        "refresh-token",
        "refresh_token",
        "client-secret",
        "client_secret",
        "password=",
        "password:",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
        || normalized.trim_start().starts_with("sk-")
}

fn redact_home_paths(value: &mut Value, home_dir: &Path) {
    match value {
        Value::Array(values) => {
            for value in values {
                redact_home_paths(value, home_dir);
            }
        }
        Value::Object(values) => {
            for value in values.values_mut() {
                redact_home_paths(value, home_dir);
            }
        }
        Value::String(value) => *value = redact_home_path_text(value, home_dir),
        _ => {}
    }
}

fn redact_home_path_text(value: &str, home_dir: &Path) -> String {
    let home = home_dir.to_string_lossy();
    if home.is_empty() || home == "/" || home == "\\" {
        return value.to_string();
    }

    let redacted = redact_home_path_variant(value, home.as_ref());
    let alternate_home = if home.contains('\\') {
        home.replace('\\', "/")
    } else {
        home.replace('/', "\\")
    };
    if alternate_home == home {
        redacted
    } else {
        redact_home_path_variant(&redacted, &alternate_home)
    }
}

fn redact_home_path_variant(value: &str, home: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut remaining = value;
    let case_insensitive = home.contains('\\') || home.as_bytes().get(1) == Some(&b':');
    let normalized_home = case_insensitive.then(|| home.to_ascii_lowercase());
    while let Some(index) = if let Some(normalized_home) = &normalized_home {
        remaining.to_ascii_lowercase().find(normalized_home)
    } else {
        remaining.find(home)
    } {
        let after_home = &remaining[index + home.len()..];
        output.push_str(&remaining[..index]);
        if after_home.is_empty() {
            output.push('~');
            remaining = after_home;
        } else if after_home.starts_with(['/', '\\']) {
            output.push_str("~/");
            remaining = &after_home[1..];
        } else {
            output.push_str(home);
            remaining = after_home;
        }
    }
    output.push_str(remaining);
    output
}

fn open_path_in_file_manager(path: &Path) -> anyhow::Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| anyhow::anyhow!("启动 Finder 失败：{error}"))
    }
    #[cfg(windows)]
    {
        chatgpt_plus_core::windows_open_url(&path.to_string_lossy())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| anyhow::anyhow!("启动文件管理器失败：{error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_home_paths_rewrites_nested_report_strings() {
        let home = Path::new("/Users/example");
        let mut report = json!({
            "settingsPath": "/Users/example/.chatgpt-plus-plus/settings.json",
            "args": ["--catalog=/Users/example/.codex/models.json"],
            "home": "/Users/example",
            "unrelated": "/Users/example-other/file"
        });

        redact_home_paths(&mut report, home);

        assert_eq!(report["settingsPath"], "~/.chatgpt-plus-plus/settings.json");
        assert_eq!(report["args"][0], "--catalog=~/.codex/models.json");
        assert_eq!(report["home"], "~");
        assert_eq!(report["unrelated"], "/Users/example-other/file");
    }

    #[test]
    fn redact_home_paths_supports_windows_separators() {
        assert_eq!(
            redact_home_path_text(
                r#"C:\Users\example\.chatgpt-plus-plus\chatgpt-plus.log"#,
                Path::new(r#"C:\Users\example"#),
            ),
            r#"~/.chatgpt-plus-plus\chatgpt-plus.log"#
        );
        assert_eq!(
            redact_home_path_text(
                "C:/Users/example/.chatgpt-plus-plus/settings.json",
                Path::new(r#"C:\Users\example"#),
            ),
            "~/.chatgpt-plus-plus/settings.json"
        );
        assert_eq!(
            redact_home_path_text(
                "c:/users/EXAMPLE/.codex/config.toml",
                Path::new(r#"C:\Users\Example"#),
            ),
            "~/.codex/config.toml"
        );
    }

    #[test]
    fn redact_sensitive_values_removes_credentials_and_embedded_config() {
        let mut report = json!({
            "settings": {
                "relayApiKey": "sk-relay-secret",
                "relayCommonConfigContents": "experimental_bearer_token = \"sk-common-secret\"",
                "relayProfiles": [{
                    "officialMixApiKey": true,
                    "apiKey": "sk-profile-secret",
                    "authContents": "{\"OPENAI_API_KEY\":\"sk-auth-secret\"}",
                    "configContents": "authorization = \"Bearer config-secret\""
                }]
            },
            "headers": {
                "Authorization": "Bearer header-secret",
                "clientSecret": "client-secret",
                "numericSecret": 123456,
                "hasBearerToken": true
            },
            "tokens": {
                "access_token": "access-secret",
                "refresh_token": "refresh-secret"
            },
            "args": [
                "--api-key=sk-argument-secret",
                "Authorization: Bearer argument-token",
                "--safe-flag"
            ]
        });

        redact_sensitive_values(&mut report);

        assert_eq!(report["settings"]["relayApiKey"], REDACTED);
        assert_eq!(report["settings"]["relayCommonConfigContents"], REDACTED);
        assert_eq!(report["settings"]["relayProfiles"][0]["apiKey"], REDACTED);
        assert_eq!(
            report["settings"]["relayProfiles"][0]["authContents"],
            REDACTED
        );
        assert_eq!(
            report["settings"]["relayProfiles"][0]["configContents"],
            REDACTED
        );
        assert_eq!(report["headers"]["Authorization"], REDACTED);
        assert_eq!(report["headers"]["clientSecret"], REDACTED);
        assert_eq!(report["headers"]["numericSecret"], REDACTED);
        assert_eq!(report["headers"]["hasBearerToken"], true);
        assert_eq!(report["tokens"], REDACTED);
        assert_eq!(report["args"][0], REDACTED);
        assert_eq!(report["args"][1], REDACTED);
        assert_eq!(report["args"][2], "--safe-flag");

        let serialized = serde_json::to_string(&report).unwrap();
        for secret in [
            "sk-relay-secret",
            "sk-common-secret",
            "sk-profile-secret",
            "sk-auth-secret",
            "config-secret",
            "header-secret",
            "client-secret",
            "access-secret",
            "refresh-secret",
            "sk-argument-secret",
            "argument-token",
        ] {
            assert!(!serialized.contains(secret));
        }
    }
}
