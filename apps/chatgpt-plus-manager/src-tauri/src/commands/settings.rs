use chatgpt_plus_core::settings::{BackendSettings, SettingsStore, normalize_settings_before_save};
use serde::Serialize;
use serde_json::{Value, json};
use tauri::Manager;

use super::shared::{CommandResult, OverviewPayload, SettingsPayload, failed, ok};
use crate::launch_runtime::{LaunchAction, ManagedLaunchRuntime};

#[derive(Debug, Clone, Serialize)]
pub struct VersionPayload {
    pub version: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcsProvidersPayload {
    pub db_path: String,
    pub providers: Vec<chatgpt_plus_core::ccs_import::CcsProviderImport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingProviderImportPayload {
    pub pending: Option<chatgpt_plus_core::provider_import::ProviderImportRequest>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    #[serde(default)]
    pub app_path: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupPayload {
    pub show_update: bool,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferenceSettingsRequest {
    pub codex_extra_args: Vec<String>,
    pub diagnostic_log_enabled: bool,
}

#[tauri::command]
pub fn backend_version() -> CommandResult<VersionPayload> {
    ok(
        "后端版本已读取。",
        VersionPayload {
            version: chatgpt_plus_core::version::VERSION.to_string(),
        },
    )
}

#[tauri::command]
pub fn startup_options() -> CommandResult<StartupPayload> {
    ok(
        "启动参数已读取。",
        StartupPayload {
            show_update: startup_should_show_update(),
        },
    )
}

pub fn startup_should_show_update() -> bool {
    should_show_update(
        std::env::args(),
        chatgpt_plus_core::branding::env_var_with_legacy(
            "CHATGPT_PLUS_SHOW_UPDATE",
            "CODEX_PLUS_SHOW_UPDATE",
        )
        .ok()
        .as_deref(),
    )
}

pub(super) fn should_show_update<I, S>(args: I, env_value: Option<&str>) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|arg| arg.as_ref() == "--show-update") || env_value == Some("1")
}

#[tauri::command]
pub async fn load_overview() -> CommandResult<OverviewPayload> {
    match tauri::async_runtime::spawn_blocking(crate::overview::load_overview_payload).await {
        Ok(payload) => ok("概览已加载。", payload),
        Err(_) => failed(
            "概览后台任务失败。",
            crate::overview::unavailable_overview_payload(),
        ),
    }
}

#[tauri::command]
pub async fn launch_chatgpt_plus(
    app: tauri::AppHandle,
    request: LaunchRequest,
) -> CommandResult<Value> {
    let runtime = app.state::<ManagedLaunchRuntime>().inner().clone();
    request_managed_launch(
        &runtime,
        request,
        LaunchAction::Launch,
        "启动任务已在后台开始，可稍后查看概览状态。",
    )
    .await
}

#[tauri::command]
pub async fn restart_chatgpt_plus(
    app: tauri::AppHandle,
    request: LaunchRequest,
) -> CommandResult<Value> {
    let runtime = app.state::<ManagedLaunchRuntime>().inner().clone();
    request_managed_launch(
        &runtime,
        request,
        LaunchAction::Restart,
        "Codex 已请求重启，启动任务正在后台运行。",
    )
    .await
}

async fn request_managed_launch(
    runtime: &ManagedLaunchRuntime,
    request: LaunchRequest,
    action: LaunchAction,
    accepted_message: &str,
) -> CommandResult<Value> {
    let protocol_proxy_port = chatgpt_plus_core::protocol_proxy::DEFAULT_PROTOCOL_PROXY_PORT;
    let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(
        "manager.launch_requested",
        json!({
            "protocol_proxy_port": protocol_proxy_port,
            "app_path": request.app_path.trim()
        }),
    );
    let launch_request = crate::launch_runtime::LaunchRequest {
        app_path: (!request.app_path.trim().is_empty())
            .then(|| std::path::PathBuf::from(request.app_path.trim())),
        protocol_proxy_port,
    };
    match runtime.start(action, launch_request).await {
        Ok(outcome) => CommandResult {
            status: "accepted".to_string(),
            message: if outcome.already_running {
                "Codex 已由 ChatGPT++ 主应用管理。".to_string()
            } else {
                accepted_message.to_string()
            },
            payload: json!({
                "protocolProxyPort": outcome.protocol_proxy_port,
                "alreadyRunning": outcome.already_running
            }),
        },
        Err(error) => failed(
            &format!("启动增强 Codex 失败：{error}"),
            json!({
                "protocolProxyPort": protocol_proxy_port
            }),
        ),
    }
}

#[tauri::command]
pub fn load_settings() -> CommandResult<SettingsPayload> {
    settings_payload("设置已加载。", "设置读取失败")
}

#[tauri::command]
pub fn save_settings(settings: BackendSettings) -> CommandResult<SettingsPayload> {
    let settings = normalize_settings_before_save(settings);
    match SettingsStore::default().save(&settings) {
        Ok(()) => {
            chatgpt_plus_core::diagnostic_log::set_diagnostic_log_enabled(
                settings.diagnostic_log_enabled,
            );
            settings_payload("设置已保存。", "设置保存后重新读取失败")
        }
        Err(error) => failed(
            &format!("保存设置失败：{error}"),
            SettingsPayload {
                settings,
                settings_path: chatgpt_plus_core::paths::default_settings_path()
                    .to_string_lossy()
                    .to_string(),
            },
        ),
    }
}

#[tauri::command]
pub fn save_preference_settings(
    request: PreferenceSettingsRequest,
) -> CommandResult<SettingsPayload> {
    let store = SettingsStore::default();
    match store.update(json!({
        "codexExtraArgs": request.codex_extra_args,
        "diagnosticLogEnabled": request.diagnostic_log_enabled,
    })) {
        Ok(settings) => {
            chatgpt_plus_core::diagnostic_log::set_diagnostic_log_enabled(
                settings.diagnostic_log_enabled,
            );
            settings_payload("偏好设置已自动保存。", "偏好设置保存后重新读取失败")
        }
        Err(error) => failed(
            &format!("自动保存偏好设置失败：{error}"),
            settings_payload_value().unwrap_or_else(|(_, payload)| payload),
        ),
    }
}

#[tauri::command]
pub fn load_ccs_providers() -> CommandResult<CcsProvidersPayload> {
    let db_path = chatgpt_plus_core::ccs_import::default_ccs_db_path();
    match chatgpt_plus_core::ccs_import::list_codex_providers_from_db(&db_path) {
        Ok(providers) => ok(
            &format!(
                "已读取 cc-switch Codex 供应商配置：{} 个。",
                providers.len()
            ),
            CcsProvidersPayload {
                db_path: db_path.to_string_lossy().to_string(),
                providers,
            },
        ),
        Err(error) => failed(
            &format!("读取 cc-switch 供应商配置失败：{error}"),
            CcsProvidersPayload {
                db_path: db_path.to_string_lossy().to_string(),
                providers: Vec::new(),
            },
        ),
    }
}

#[tauri::command]
pub fn import_ccs_providers() -> CommandResult<SettingsPayload> {
    let providers = match chatgpt_plus_core::ccs_import::list_codex_providers_from_default_db() {
        Ok(providers) => providers,
        Err(error) => {
            let payload = settings_payload_value().unwrap_or_else(|(_, payload)| payload);
            return failed(&format!("读取 cc-switch 供应商配置失败：{error}"), payload);
        }
    };

    let store = SettingsStore::default();
    let mut settings = store.load().unwrap_or_default();
    let mut existing_keys: Vec<String> = settings
        .relay_profiles
        .iter()
        .map(chatgpt_plus_core::ccs_import::imported_provider_identity)
        .collect();
    let mut existing_ids: Vec<String> = settings
        .relay_profiles
        .iter()
        .map(|profile| profile.id.clone())
        .collect();
    let mut imported = 0usize;

    for provider in providers {
        let key = chatgpt_plus_core::ccs_import::provider_identity_from_ccs(&provider);
        if existing_keys.iter().any(|existing| existing == &key) {
            continue;
        }
        let profile =
            chatgpt_plus_core::ccs_import::relay_profile_from_ccs(&provider, &existing_ids);
        existing_ids.push(profile.id.clone());
        existing_keys.push(key);
        settings.relay_profiles.push(profile);
        imported += 1;
    }

    if imported == 0 {
        return settings_payload("没有新的 cc-switch 供应商配置需要导入。", "设置读取失败");
    }

    settings = normalize_settings_before_save(settings);
    match store.save(&settings) {
        Ok(()) => {
            chatgpt_plus_core::diagnostic_log::set_diagnostic_log_enabled(
                settings.diagnostic_log_enabled,
            );
            settings_payload(
                &format!("已从 cc-switch 导入供应商配置：{imported} 个。"),
                "导入供应商配置后重新读取设置失败",
            )
        }
        Err(error) => failed(
            &format!("保存 cc-switch 供应商配置失败：{error}"),
            settings_payload_value().unwrap_or_else(|(_, payload)| payload),
        ),
    }
}

#[tauri::command]
pub fn load_pending_provider_import() -> CommandResult<PendingProviderImportPayload> {
    match chatgpt_plus_core::provider_import::load_pending_provider_import() {
        Ok(pending) => ok(
            "待确认供应商导入已读取。",
            PendingProviderImportPayload { pending },
        ),
        Err(error) => failed(
            &format!("读取待确认供应商导入失败：{error}"),
            PendingProviderImportPayload { pending: None },
        ),
    }
}

#[tauri::command]
pub fn confirm_pending_provider_import() -> CommandResult<SettingsPayload> {
    match chatgpt_plus_core::provider_import::confirm_pending_provider_import() {
        Ok(Some(result)) => {
            let message = if result.imported {
                format!("已导入供应商配置：{}。", result.profile_name)
            } else {
                format!("供应商配置已存在：{}。", result.profile_name)
            };
            settings_payload(&message, "供应商导入后重新读取设置失败")
        }
        Ok(None) => settings_payload("没有待确认的供应商导入。", "设置读取失败"),
        Err(error) => failed(
            &format!("导入供应商配置失败：{error}"),
            settings_payload_value().unwrap_or_else(|(_, payload)| payload),
        ),
    }
}

#[tauri::command]
pub fn dismiss_pending_provider_import() -> CommandResult<PendingProviderImportPayload> {
    match chatgpt_plus_core::provider_import::clear_pending_provider_import() {
        Ok(()) => ok(
            "已取消供应商导入。",
            PendingProviderImportPayload { pending: None },
        ),
        Err(error) => failed(
            &format!("取消供应商导入失败：{error}"),
            PendingProviderImportPayload { pending: None },
        ),
    }
}
#[tauri::command]
pub fn reset_settings() -> CommandResult<SettingsPayload> {
    let settings = BackendSettings::default();
    match SettingsStore::default().save(&settings) {
        Ok(()) => {
            chatgpt_plus_core::diagnostic_log::set_diagnostic_log_enabled(
                settings.diagnostic_log_enabled,
            );
            settings_payload("设置已重置为默认值。", "设置重置后重新读取失败")
        }
        Err(error) => failed(
            &format!("重置设置失败：{error}"),
            SettingsPayload {
                settings,
                settings_path: chatgpt_plus_core::paths::default_settings_path()
                    .to_string_lossy()
                    .to_string(),
            },
        ),
    }
}
fn settings_payload(message: &str, failure_context: &str) -> CommandResult<SettingsPayload> {
    match settings_payload_value() {
        Ok(payload) => ok(message, payload),
        Err((error, payload)) => failed(&format!("{failure_context}：{error}"), payload),
    }
}

fn settings_payload_value() -> Result<SettingsPayload, (anyhow::Error, SettingsPayload)> {
    let store = SettingsStore::default();
    let settings_path = chatgpt_plus_core::paths::default_settings_path()
        .to_string_lossy()
        .to_string();
    match store.load() {
        Ok(settings) => Ok(SettingsPayload {
            settings,
            settings_path,
        }),
        Err(error) => Err((
            error,
            SettingsPayload {
                settings: BackendSettings::default(),
                settings_path,
            },
        )),
    }
}
