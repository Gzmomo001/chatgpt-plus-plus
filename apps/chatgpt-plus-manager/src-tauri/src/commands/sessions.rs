use std::path::PathBuf;

use chatgpt_plus_core::models::{DeleteResult, SessionRef};
use chatgpt_plus_core::settings::SettingsStore;
use serde::Serialize;
use serde_json::{Value, json};

use super::shared::{CommandResult, failed, ok};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSessionsPayload {
    pub db_path: String,
    pub db_paths: Vec<String>,
    pub sessions: Vec<chatgpt_plus_data::LocalSession>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLocalSessionRequest {
    pub session_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub db_path: Option<String>,
}

#[tauri::command]
pub fn list_local_sessions() -> CommandResult<LocalSessionsPayload> {
    let inventory = chatgpt_plus_data::list_local_sessions_from_home(
        &chatgpt_plus_core::codex_sqlite::default_codex_home_dir(),
        &chatgpt_plus_core::paths::default_app_state_dir(),
    );
    let payload = LocalSessionsPayload {
        db_path: inventory
            .db_paths
            .first()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default(),
        db_paths: inventory
            .db_paths
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        sessions: inventory.sessions,
    };
    if inventory.errors.is_empty() {
        ok(
            &format!("已读取 {} 个本地会话。", payload.sessions.len()),
            payload,
        )
    } else {
        failed(
            &format!("读取部分本地会话失败：{}", inventory.errors.join("; ")),
            payload,
        )
    }
}

#[tauri::command]
pub fn delete_local_session(request: DeleteLocalSessionRequest) -> CommandResult<DeleteResult> {
    let requested_db_path = request.db_path.as_deref().map(PathBuf::from);
    let result = chatgpt_plus_data::delete_local_session_from_home(
        &chatgpt_plus_core::codex_sqlite::default_codex_home_dir(),
        &chatgpt_plus_core::paths::default_app_state_dir(),
        requested_db_path.as_deref(),
        &SessionRef {
            session_id: request.session_id,
            title: request.title,
        },
    );
    let status = if matches!(
        result.status,
        chatgpt_plus_core::models::DeleteStatus::LocalDeleted
    ) {
        "ok"
    } else {
        "failed"
    };
    CommandResult {
        status: status.to_string(),
        message: result.message.clone(),
        payload: result,
    }
}

#[tauri::command]
pub async fn load_provider_sync_targets() -> CommandResult<Value> {
    let settings = SettingsStore::default().load().unwrap_or_default();
    let result = tauri::async_runtime::spawn_blocking(move || {
        chatgpt_plus_data::load_provider_sync_targets_with_settings(None, &settings)
    })
    .await
    .map_err(|error| anyhow::anyhow!("provider target discovery task failed: {error}"));
    match result {
        Ok(targets) => ok(
            "Provider 同步目标已加载。",
            serde_json::to_value(targets).unwrap_or_else(|_| json!({})),
        ),
        Err(error) => failed(&format!("Provider 同步目标加载失败：{error}"), json!({})),
    }
}

#[tauri::command]
pub async fn sync_providers_now(target_provider: Option<String>) -> CommandResult<Value> {
    let target_provider = target_provider
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let result = tauri::async_runtime::spawn_blocking(move || {
        chatgpt_plus_data::run_provider_sync_with_settings(
            None,
            target_provider.as_deref(),
            &SettingsStore::default(),
        )
    })
    .await
    .map_err(|error| anyhow::anyhow!("provider sync task failed: {error}"));
    match result {
        Ok(sync) => ok(
            &format!(
                "供应商已同步一次：{} 个会话文件，{} 行索引，跳过 {} 个占用文件。",
                sync.changed_session_files,
                sync.sqlite_rows_updated,
                sync.skipped_locked_rollout_files.len()
            ),
            json!({
                "syncStatus": sync.status,
                "targetProvider": sync.target_provider,
                "changedSessionFiles": sync.changed_session_files,
                "skippedLockedRolloutFiles": sync.skipped_locked_rollout_files,
                "sqliteRowsUpdated": sync.sqlite_rows_updated,
                "sqliteProviderRowsUpdated": sync.sqlite_provider_rows_updated,
                "sqliteUserEventRowsUpdated": sync.sqlite_user_event_rows_updated,
                "sqliteCwdRowsUpdated": sync.sqlite_cwd_rows_updated,
                "updatedWorkspaceRoots": sync.updated_workspace_roots,
                "encryptedContentWarning": sync.encrypted_content_warning,
                "backupDir": sync.backup_dir,
                "syncMessage": sync.message,
            }),
        ),
        Err(error) => failed(&format!("供应商同步失败：{error}"), json!({})),
    }
}
