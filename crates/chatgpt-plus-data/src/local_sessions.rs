use std::collections::HashSet;
use std::path::{Path, PathBuf};

use chatgpt_plus_core::models::{DeleteResult, DeleteStatus, SessionRef};
use serde_json::json;

use crate::{BackupStore, LocalSession, SQLiteStorageAdapter, delete_local_from_paths};

#[derive(Debug, Clone)]
pub struct LocalSessionInventory {
    pub db_paths: Vec<PathBuf>,
    pub sessions: Vec<LocalSession>,
    pub errors: Vec<String>,
}

pub fn list_local_sessions_from_home(home: &Path, app_state_dir: &Path) -> LocalSessionInventory {
    let db_paths = chatgpt_plus_core::codex_sqlite::codex_session_db_paths_from_home(home);
    let mut sessions = Vec::new();
    let mut errors = Vec::new();
    for db_path in &db_paths {
        let adapter = local_session_adapter(db_path, app_state_dir);
        match adapter.list_local_sessions() {
            Ok(mut items) => sessions.append(&mut items),
            Err(error) if db_path.exists() => {
                errors.push(format!("{}: {error}", db_path.to_string_lossy()));
            }
            Err(_) => {}
        }
    }
    sessions.sort_by(|left, right| {
        right
            .updated_at_ms
            .cmp(&left.updated_at_ms)
            .then_with(|| right.id.cmp(&left.id))
    });
    let mut seen_session_ids = HashSet::new();
    sessions.retain(|session| seen_session_ids.insert(session.id.clone()));
    LocalSessionInventory {
        db_paths,
        sessions,
        errors,
    }
}

pub fn delete_local_session_from_home(
    home: &Path,
    app_state_dir: &Path,
    requested_db_path: Option<&Path>,
    session: &SessionRef,
) -> DeleteResult {
    let session_id = session.session_id.trim();
    if session_id.is_empty() {
        return DeleteResult {
            status: DeleteStatus::Failed,
            session_id: String::new(),
            message: "会话 ID 不能为空。".to_string(),
            undo_token: None,
            backup_path: None,
        };
    }
    let session = SessionRef {
        session_id: session_id.to_string(),
        title: session.title.clone(),
    };
    let mut candidate_paths = Vec::new();
    if let Some(path) = requested_db_path {
        push_unique(&mut candidate_paths, path.to_path_buf());
    }
    for path in chatgpt_plus_core::codex_sqlite::codex_session_db_paths_from_home(home) {
        push_unique(&mut candidate_paths, path);
    }
    log_manager_event(
        "manager.delete_local_session.start",
        json!({
            "session_id": session_id,
            "title": session.title,
            "requested_db_path": requested_db_path,
            "candidate_paths": candidate_paths
                .iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect::<Vec<_>>(),
        }),
    );
    let result = delete_local_from_paths(
        candidate_paths.clone(),
        BackupStore::new(app_state_dir.join("backups")),
        &session,
    );
    log_manager_event(
        "manager.delete_local_session.finish",
        json!({
            "session_id": session_id,
            "final_status": format!("{:?}", result.status),
            "final_message": result.message,
            "candidate_paths": candidate_paths
                .iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect::<Vec<_>>(),
        }),
    );
    result
}

fn local_session_adapter(db_path: &Path, app_state_dir: &Path) -> SQLiteStorageAdapter {
    SQLiteStorageAdapter::new(db_path, BackupStore::new(app_state_dir.join("backups")))
}

fn push_unique(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|candidate| candidate == &path) {
        paths.push(path);
    }
}

fn log_manager_event(event: &str, detail: serde_json::Value) {
    let _ = chatgpt_plus_core::diagnostic_log::append_diagnostic_log(event, detail);
}
