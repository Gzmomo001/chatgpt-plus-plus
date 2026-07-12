use std::path::Path;

use chatgpt_plus_core::models::{DeleteStatus, SessionRef};
use rusqlite::Connection;

#[test]
fn inventory_deduplicates_threads_across_current_and_legacy_databases() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex-home");
    let sqlite_dir = home.join("sqlite");
    std::fs::create_dir_all(&sqlite_dir).unwrap();
    let current_db = sqlite_dir.join("state_5.sqlite");
    let legacy_db = home.join("state_5.sqlite");
    create_minimal_thread_db(&current_db, "t1", "Current Copy", 100);
    create_minimal_thread_db(&legacy_db, "t1", "Legacy Copy", 200);

    let inventory = chatgpt_plus_data::list_local_sessions_from_home(&home, temp.path());

    assert!(inventory.errors.is_empty());
    assert_eq!(inventory.sessions.len(), 1);
    assert_eq!(inventory.sessions[0].title, "Legacy Copy");
    assert_eq!(inventory.sessions[0].db_path, legacy_db.to_string_lossy());
}

#[test]
fn delete_removes_duplicate_threads_from_every_candidate_database() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("codex-home");
    let sqlite_dir = home.join("sqlite");
    std::fs::create_dir_all(&sqlite_dir).unwrap();
    let current_db = sqlite_dir.join("state_5.sqlite");
    let legacy_db = home.join("state_5.sqlite");
    create_minimal_thread_db(&current_db, "t1", "Current Copy", 100);
    create_minimal_thread_db(&legacy_db, "t1", "Legacy Copy", 200);

    let result = chatgpt_plus_data::delete_local_session_from_home(
        &home,
        temp.path(),
        Some(&legacy_db),
        &SessionRef {
            session_id: "t1".to_string(),
            title: "Legacy Copy".to_string(),
        },
    );

    assert_eq!(result.status, DeleteStatus::LocalDeleted);
    assert_eq!(thread_count(&current_db, "t1"), 0);
    assert_eq!(thread_count(&legacy_db, "t1"), 0);
}

fn create_minimal_thread_db(path: &Path, id: &str, title: &str, updated_at_ms: i64) {
    let db = Connection::open(path).unwrap();
    db.execute(
        "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, title TEXT, updated_at_ms INTEGER)",
        [],
    )
    .unwrap();
    db.execute(
        "INSERT INTO threads VALUES (?1, '', ?2, ?3)",
        (id, title, updated_at_ms),
    )
    .unwrap();
}

fn thread_count(path: &Path, id: &str) -> i64 {
    let db = Connection::open(path).unwrap();
    db.query_row("SELECT COUNT(*) FROM threads WHERE id = ?1", [id], |row| {
        row.get::<_, i64>(0)
    })
    .unwrap()
}
