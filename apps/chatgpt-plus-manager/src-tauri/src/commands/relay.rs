use std::path::Path;
use std::sync::{Mutex, OnceLock};

use chatgpt_plus_core::codex_home_apply::CodexHomeReconcileIntent;
use chatgpt_plus_core::settings::{
    BackendSettings, RelayProfile, SettingsStore, normalize_settings_before_save,
};
use serde::Serialize;
use serde_json::{Value, json};

use super::shared::{CommandResult, failed, ok};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayPayload {
    pub authenticated: bool,
    pub auth_source: String,
    pub account_label: Option<String>,
    pub config_path: String,
    pub configured: bool,
    pub requires_openai_auth: bool,
    pub has_bearer_token: bool,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayFilesPayload {
    pub config_path: String,
    pub auth_path: String,
    pub config_contents: String,
    pub auth_contents: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelaySwitchPayload {
    pub settings: BackendSettings,
    pub relay: RelayPayload,
    pub settings_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsBackfillPayload {
    pub settings: BackendSettings,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayProfileTestPayload {
    pub http_status: u16,
    pub endpoint: String,
    pub response_preview: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayProfileModelsPayload {
    pub models: Vec<String>,
    pub endpoint: String,
}
use chatgpt_plus_core::provider_doctor::ProviderDoctorPayload;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRelayFileRequest {
    pub kind: String,
    pub contents: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackfillRelayProfileRequest {
    pub settings: BackendSettings,
    pub profile_id: String,
}
#[tauri::command]
pub fn relay_status() -> CommandResult<RelayPayload> {
    let status = chatgpt_plus_core::relay_config::default_relay_status();
    let message = if status.authenticated {
        "已检测到 ChatGPT 登录状态。"
    } else {
        "未检测到 ChatGPT 登录状态，请先在 Codex/ChatGPT 中正常登录。"
    };
    ok(message, relay_payload(status, None))
}

#[tauri::command]
pub fn read_relay_files() -> CommandResult<RelayFilesPayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    match relay_files_payload_from_home(&home) {
        Ok(payload) => ok("配置文件内容已读取。", payload),
        Err(error) => failed(
            &format!("读取配置文件失败：{error}"),
            RelayFilesPayload {
                config_path: home.join("config.toml").to_string_lossy().to_string(),
                auth_path: home.join("auth.json").to_string_lossy().to_string(),
                config_contents: String::new(),
                auth_contents: String::new(),
            },
        ),
    }
}

#[tauri::command]
pub fn save_relay_file(request: SaveRelayFileRequest) -> CommandResult<RelayFilesPayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    match save_relay_file_in_home(&home, &request.kind, &request.contents)
        .and_then(|_| relay_files_payload_from_home(&home))
    {
        Ok(payload) => ok("配置文件已保存。", payload),
        Err(error) => failed(
            &format!("保存配置文件失败：{error}"),
            relay_files_payload_from_home(&home).unwrap_or_else(|_| RelayFilesPayload {
                config_path: home.join("config.toml").to_string_lossy().to_string(),
                auth_path: home.join("auth.json").to_string_lossy().to_string(),
                config_contents: String::new(),
                auth_contents: String::new(),
            }),
        ),
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayProfileSwitchRequest {
    pub settings: BackendSettings,
    pub target_relay_id: String,
}

#[tauri::command]
pub fn switch_relay_profile(
    request: RelayProfileSwitchRequest,
) -> CommandResult<RelaySwitchPayload> {
    let Ok(_guard) = relay_switch_mutex().lock() else {
        let status = chatgpt_plus_core::relay_config::default_relay_status();
        return failed(
            "供应商切换锁已损坏，请重启管理器后再试。",
            relay_switch_payload(
                SettingsStore::default().load().unwrap_or_default(),
                status,
                None,
            ),
        );
    };
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    let store = SettingsStore::default();
    let settings = normalize_settings_before_save(request.settings);
    let target_relay_id = request.target_relay_id;
    log_manager_event(
        "manager.switch_relay_profile.start",
        json!({
            "targetRelayId": target_relay_id
        }),
    );
    match chatgpt_plus_core::codex_home_apply::activate(&store, &home, settings, &target_relay_id) {
        Ok(activation) => {
            let backup_path = activation
                .home
                .backup_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string());
            log_manager_event(
                "manager.switch_relay_profile.ok",
                json!({
                    "targetRelayId": activation.settings.active_relay_id,
                    "configured": activation.home.status.configured,
                    "backupPath": backup_path.as_ref()
                }),
            );
            ok(
                "供应商已切换。",
                relay_switch_payload(activation.settings, activation.home.status, backup_path),
            )
        }
        Err(error) => {
            let status = chatgpt_plus_core::relay_config::relay_status_from_home(&home);
            let settings = store.load().unwrap_or_default();
            log_manager_event(
                "manager.switch_relay_profile.failed",
                json!({
                    "targetRelayId": target_relay_id,
                    "activeRelayId": settings.active_relay_id,
                    "error": error.to_string()
                }),
            );
            failed(
                &format!("供应商切换失败：{error}"),
                relay_switch_payload(settings, status, None),
            )
        }
    }
}

#[tauri::command]
pub fn backfill_relay_profile_from_live(
    request: BackfillRelayProfileRequest,
) -> CommandResult<SettingsBackfillPayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    let mut settings = request.settings;
    let requested_profile_id = request.profile_id.clone();
    log_manager_event(
        "manager.backfill_relay_profile_from_live.start",
        json!({
            "profileId": requested_profile_id,
            "activeRelayId": settings.active_relay_id
        }),
    );
    let Some(profile) = settings
        .relay_profiles
        .iter_mut()
        .find(|profile| profile.id == request.profile_id)
    else {
        log_manager_event(
            "manager.backfill_relay_profile_from_live.missing_profile",
            json!({
                "profileId": requested_profile_id
            }),
        );
        return failed(
            "当前供应商已不在配置列表中，已停止切换以避免覆盖用户改动。",
            SettingsBackfillPayload { settings },
        );
    };

    match chatgpt_plus_core::relay_config::backfill_relay_profile_from_home_with_common(
        &home,
        profile,
        &mut settings.relay_context_config_contents,
    ) {
        Ok(()) => {
            log_manager_event(
                "manager.backfill_relay_profile_from_live.ok",
                json!({
                    "profileId": requested_profile_id
                }),
            );
            ok(
                "当前供应商配置已从 live 文件回填。",
                SettingsBackfillPayload { settings },
            )
        }
        Err(error) => {
            log_manager_event(
                "manager.backfill_relay_profile_from_live.failed",
                json!({
                    "profileId": requested_profile_id,
                    "error": error.to_string()
                }),
            );
            failed(
                &format!("回填当前供应商配置失败：{error}"),
                SettingsBackfillPayload { settings },
            )
        }
    }
}

#[tauri::command]
pub async fn test_relay_profile(profile: RelayProfile) -> CommandResult<RelayProfileTestPayload> {
    let profile_name = if profile.name.trim().is_empty() {
        "未命名供应商"
    } else {
        profile.name.trim()
    };
    let settings = SettingsStore::default().load().unwrap_or_default();
    let test_model: String = if !profile.test_model.trim().is_empty() {
        // 1. 使用者在該供應商明確填的測試模型
        profile.test_model.trim().to_string()
    } else {
        // 2. 該供應商自己 config.toml 裡的 model（避免串味）
        let from_profile = chatgpt_plus_core::relay_config::relay_profile_model(&profile);
        if from_profile.trim().is_empty() {
            // 3. 最後才用全域預設
            settings.relay_test_model.trim().to_string()
        } else {
            from_profile
        }
    };
    match chatgpt_plus_core::relay_config::test_relay_profile(&profile, &test_model).await {
        Ok(result) => {
            let status = if result.http_status < 400 {
                "ok"
            } else {
                "failed"
            };
            let preview = result.response_preview.trim();
            let detail = if preview.is_empty() {
                "响应内容为空".to_string()
            } else {
                format!("响应：{preview}")
            };
            CommandResult {
                status: status.to_string(),
                message: format!(
                    "已向「{profile_name}」用模型「{test_model}」发送 hi，HTTP {}。{detail}",
                    result.http_status
                ),
                payload: RelayProfileTestPayload {
                    http_status: result.http_status,
                    endpoint: result.endpoint,
                    response_preview: result.response_preview,
                },
            }
        }
        Err(error) => failed(
            &format!("测试「{profile_name}」失败：{error}"),
            RelayProfileTestPayload {
                http_status: 0,
                endpoint: String::new(),
                response_preview: String::new(),
            },
        ),
    }
}

#[tauri::command]
pub async fn fetch_relay_profile_models(
    profile: RelayProfile,
) -> CommandResult<RelayProfileModelsPayload> {
    let profile_name = if profile.name.trim().is_empty() {
        "未命名供应商"
    } else {
        profile.name.trim()
    };
    match chatgpt_plus_core::model_catalog::fetch_relay_profile_model_ids(&profile).await {
        Ok((models, endpoint)) => ok(
            &format!("已从「{profile_name}」获取 {} 个模型。", models.len()),
            RelayProfileModelsPayload { models, endpoint },
        ),
        Err(error) => failed(
            &format!("从「{profile_name}」获取模型失败：{error}"),
            RelayProfileModelsPayload {
                models: Vec::new(),
                endpoint: String::new(),
            },
        ),
    }
}

#[tauri::command]
pub async fn diagnose_relay_profile(profile: RelayProfile) -> CommandResult<ProviderDoctorPayload> {
    let settings = SettingsStore::default().load().unwrap_or_default();
    let outcome =
        chatgpt_plus_core::provider_doctor::diagnose(&profile, &settings.relay_test_model).await;
    CommandResult {
        status: outcome.status,
        message: outcome.message,
        payload: outcome.payload,
    }
}

#[tauri::command]
pub fn apply_relay_injection() -> CommandResult<RelayPayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    let settings = SettingsStore::default().load().unwrap_or_default();
    reconcile_relay_injection_in_home(
        "manager.apply_relay_injection",
        &home,
        &settings,
        "供应商配置已应用。",
        "应用供应商配置失败",
    )
}

#[tauri::command]
pub fn apply_pure_api_injection() -> CommandResult<RelayPayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    let settings = SettingsStore::default().load().unwrap_or_default();
    reconcile_relay_injection_in_home(
        "manager.apply_pure_api_injection",
        &home,
        &settings,
        "纯 API 供应商配置已应用。",
        "应用纯 API 供应商配置失败",
    )
}

pub(super) fn reconcile_relay_injection_in_home(
    event: &str,
    home: &Path,
    settings: &BackendSettings,
    success_message: &str,
    failure_prefix: &str,
) -> CommandResult<RelayPayload> {
    let relay = settings.active_relay_profile();
    log_relay_apply_request(event, settings, &relay);
    match chatgpt_plus_core::codex_home_apply::reconcile(
        home,
        CodexHomeReconcileIntent::ApplyActiveProfile { settings },
    ) {
        Ok(outcome) => {
            let backup_path = outcome
                .backup_path
                .map(|path| path.to_string_lossy().to_string());
            log_relay_apply_result(
                &format!("{event}.ok"),
                &relay,
                &outcome.status,
                backup_path.as_ref(),
                None,
            );
            ok(success_message, relay_payload(outcome.status, backup_path))
        }
        Err(error) => {
            let status = chatgpt_plus_core::relay_config::relay_status_from_home(home);
            log_relay_apply_result(
                &format!("{event}.failed"),
                &relay,
                &status,
                None,
                Some(error.to_string()),
            );
            failed(
                &format!("{failure_prefix}：{error}"),
                relay_payload(status, None),
            )
        }
    }
}

#[tauri::command]
pub fn clear_relay_injection() -> CommandResult<RelayPayload> {
    let home = chatgpt_plus_core::codex_home::default_codex_home_dir();
    let settings = SettingsStore::default().load().unwrap_or_default();
    clear_relay_injection_in_home(&home, &settings)
}

pub(super) fn clear_relay_injection_in_home(
    home: &Path,
    settings: &BackendSettings,
) -> CommandResult<RelayPayload> {
    log_manager_event("manager.clear_relay_injection.start", json!({}));
    match chatgpt_plus_core::codex_home_apply::reconcile(
        home,
        CodexHomeReconcileIntent::ClearManagedRelay { settings },
    ) {
        Ok(outcome) => {
            let backup_path = outcome
                .backup_path
                .map(|path| path.to_string_lossy().to_string());
            log_manager_event(
                "manager.clear_relay_injection.ok",
                json!({
                    "configured": outcome.status.configured,
                    "backupPath": backup_path.as_ref()
                }),
            );
            ok(
                "已清除 custom 中转 API 模式，并切换到官方 ChatGPT 登录模式。",
                relay_payload(outcome.status, backup_path),
            )
        }
        Err(error) => {
            let status = chatgpt_plus_core::relay_config::relay_status_from_home(home);
            log_manager_event(
                "manager.clear_relay_injection.failed",
                json!({
                    "configured": status.configured,
                    "error": error.to_string()
                }),
            );
            failed(
                &format!("清除中转配置失败：{error}"),
                relay_payload(status, None),
            )
        }
    }
}

fn log_relay_apply_request(
    event: &str,
    settings: &BackendSettings,
    relay: &chatgpt_plus_core::settings::RelayProfile,
) {
    let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
        event,
        json!({
            "activeRelayId": settings.active_relay_id,
            "relayId": relay.id,
            "relayName": relay.name,
            "relayMode": relay.relay_mode,
            "protocol": relay.protocol,
            "baseUrl": relay.base_url,
            "hasConfigContents": !relay.config_contents.trim().is_empty(),
            "hasAuthContents": !relay.auth_contents.trim().is_empty(),
            "configContainsProxy": relay.config_contents.contains("127.0.0.1:57321")
        }),
    );
}

fn log_relay_apply_result(
    event: &str,
    relay: &chatgpt_plus_core::settings::RelayProfile,
    status: &chatgpt_plus_core::relay_config::RelayStatus,
    backup_path: Option<&String>,
    error: Option<String>,
) {
    log_manager_event(
        event,
        json!({
            "relayId": relay.id,
            "relayName": relay.name,
            "relayMode": relay.relay_mode,
            "protocol": relay.protocol,
            "configured": status.configured,
            "requiresOpenaiAuth": status.requires_openai_auth,
            "hasBearerToken": status.has_bearer_token,
            "backupPath": backup_path,
            "error": error
        }),
    );
}

fn log_manager_event(event: &str, detail: Value) {
    let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(event, detail);
}

pub(super) fn relay_payload(
    status: chatgpt_plus_core::relay_config::RelayStatus,
    backup_path: Option<String>,
) -> RelayPayload {
    RelayPayload {
        authenticated: status.authenticated,
        auth_source: status.auth_source,
        account_label: status.account_label,
        config_path: status.config_path,
        configured: status.configured,
        requires_openai_auth: status.requires_openai_auth,
        has_bearer_token: status.has_bearer_token,
        backup_path,
    }
}

fn relay_switch_payload(
    settings: BackendSettings,
    status: chatgpt_plus_core::relay_config::RelayStatus,
    backup_path: Option<String>,
) -> RelaySwitchPayload {
    RelaySwitchPayload {
        settings,
        relay: relay_payload(status, backup_path),
        settings_path: chatgpt_plus_core::paths::default_settings_path()
            .to_string_lossy()
            .to_string(),
    }
}

fn relay_switch_mutex() -> &'static Mutex<()> {
    static RELAY_SWITCH_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    RELAY_SWITCH_LOCK.get_or_init(|| Mutex::new(()))
}

pub(super) fn relay_files_payload_from_home(
    home: &std::path::Path,
) -> anyhow::Result<RelayFilesPayload> {
    let config_path = home.join("config.toml");
    let auth_path = home.join("auth.json");
    Ok(RelayFilesPayload {
        config_path: config_path.to_string_lossy().to_string(),
        auth_path: auth_path.to_string_lossy().to_string(),
        config_contents: read_optional_text_file(&config_path)?,
        auth_contents: read_optional_text_file(&auth_path)?,
    })
}

pub(super) fn save_relay_file_in_home(
    home: &std::path::Path,
    kind: &str,
    contents: &str,
) -> anyhow::Result<()> {
    let path = match kind {
        "config" => home.join("config.toml"),
        "auth" => home.join("auth.json"),
        other => anyhow::bail!("未知配置文件类型：{other}"),
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, contents)?;
    Ok(())
}

fn read_optional_text_file(path: &std::path::Path) -> anyhow::Result<String> {
    match std::fs::read_to_string(path) {
        Ok(contents) => Ok(contents),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.into()),
    }
}
