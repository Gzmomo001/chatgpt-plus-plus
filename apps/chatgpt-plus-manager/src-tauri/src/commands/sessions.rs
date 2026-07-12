use std::path::PathBuf;

use chatgpt_plus_core::models::{DeleteResult, ExportResult, ExportStatus, SessionRef};
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

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportLocalSessionRequest {
    pub session_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub db_path: Option<String>,
    #[serde(default)]
    pub destination_path: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSessionUsageRequest {
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
pub fn export_local_session_markdown(
    request: ExportLocalSessionRequest,
) -> CommandResult<ExportResult> {
    export_local_session_markdown_from_home(
        &chatgpt_plus_core::codex_sqlite::default_codex_home_dir(),
        request,
    )
}

pub(super) fn export_local_session_markdown_from_home(
    home: &std::path::Path,
    request: ExportLocalSessionRequest,
) -> CommandResult<ExportResult> {
    let session = SessionRef {
        session_id: request.session_id,
        title: request.title,
    };
    let db_paths = candidate_db_paths(home, request.db_path.as_deref());
    let mut result = chatgpt_plus_data::export_markdown_from_paths(db_paths, &session);
    if matches!(result.status, ExportStatus::Exported)
        && let Some(destination) = request
            .destination_path
            .as_deref()
            .map(str::trim)
            .filter(|path| !path.is_empty())
    {
        let path = PathBuf::from(destination);
        let write_result = result
            .markdown
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("导出内容为空"))
            .and_then(|markdown| {
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(&path, markdown.as_bytes())?;
                Ok(())
            });
        match write_result {
            Ok(()) => {
                result.message = format!("Markdown 已保存到：{}", path.to_string_lossy());
                result.filename = Some(path.to_string_lossy().to_string());
            }
            Err(error) => {
                result.status = ExportStatus::Failed;
                result.message = format!("保存 Markdown 失败：{error}");
            }
        }
    }
    let status = if matches!(result.status, ExportStatus::Exported) {
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
pub fn load_local_session_usage(request: LocalSessionUsageRequest) -> CommandResult<Value> {
    load_local_session_usage_from_home(
        &chatgpt_plus_core::codex_sqlite::default_codex_home_dir(),
        request,
    )
}

pub(super) fn load_local_session_usage_from_home(
    home: &std::path::Path,
    request: LocalSessionUsageRequest,
) -> CommandResult<Value> {
    let session = SessionRef {
        session_id: request.session_id,
        title: request.title,
    };
    let mut payload = json!({
        "sessionId": session.session_id,
        "rolloutPath": null,
        "history": [],
    });
    let mut message = "未找到对应会话的 Token 使用历史。".to_string();
    for path in candidate_db_paths(home, request.db_path.as_deref()) {
        if !path.is_file() {
            continue;
        }
        let adapter = chatgpt_plus_data::SQLiteStorageAdapter::new(
            path,
            chatgpt_plus_data::BackupStore::new(home.join(".tmp-usage-backups")),
        );
        let candidate = adapter.codex_thread_usage_history(&session);
        if candidate.get("status").and_then(Value::as_str) == Some("ok") {
            let mut history = candidate
                .get("history")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            for item in &mut history {
                let Some(object) = item.as_object_mut() else {
                    continue;
                };
                rename_json_key(object, "conversation_id", "conversationId");
                rename_json_key(object, "turn_id", "turnId");
                rename_json_key(object, "observed_at", "observedAt");
            }
            let count = history.len();
            message = format!("已读取 {count} 条 Token 使用记录。");
            payload = json!({
                "sessionId": candidate.get("session_id").and_then(Value::as_str).unwrap_or(&session.session_id),
                "rolloutPath": candidate.get("rollout_path").cloned().unwrap_or(Value::Null),
                "history": history,
            });
            return ok(&message, payload);
        }
        if let Some(candidate_message) = candidate.get("message").and_then(Value::as_str) {
            message = candidate_message.to_string();
            payload = candidate;
        }
    }
    failed(&message, payload)
}

fn rename_json_key(object: &mut serde_json::Map<String, Value>, from: &str, to: &str) {
    if let Some(value) = object.remove(from) {
        object.insert(to.to_string(), value);
    }
}

fn candidate_db_paths(home: &std::path::Path, requested: Option<&str>) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(path) = requested.map(str::trim).filter(|path| !path.is_empty()) {
        paths.push(PathBuf::from(path));
    }
    for path in chatgpt_plus_core::codex_sqlite::codex_session_db_paths_from_home(home) {
        if !paths.iter().any(|candidate| candidate == &path) {
            paths.push(path);
        }
    }
    paths
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
