use std::fs;
use std::path::PathBuf;

use anyhow::Context;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LaunchStatus {
    pub status: String,
    pub message: String,
    pub started_at_ms: u64,
    pub protocol_proxy_port: Option<u16>,
    pub codex_app: Option<String>,
}

#[derive(Debug, Clone)]
pub struct StatusStore {
    path: PathBuf,
}

impl Default for StatusStore {
    fn default() -> Self {
        Self::new(crate::paths::default_latest_status_path())
    }
}

impl StatusStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn save_latest(&self, status: &LaunchStatus) -> anyhow::Result<()> {
        let bytes = serde_json::to_vec_pretty(status)?;
        crate::atomic_file::write(&self.path, &bytes)
    }

    pub fn load_latest(&self) -> anyhow::Result<Option<LaunchStatus>> {
        let contents = match fs::read_to_string(&self.path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("failed to read latest status {}", self.path.display())
                });
            }
        };

        Ok(serde_json::from_str(&contents).ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "chatgpt-plus-core-status-test-{}-{}",
            std::process::id(),
            NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn status_store_save_load_latest_roundtrip_uses_custom_path() {
        let dir = temp_dir();
        let store = StatusStore::new(dir.join("nested").join("latest-status.json"));
        let status = LaunchStatus {
            status: "running".to_string(),
            message: "ready".to_string(),
            started_at_ms: 12345,
            protocol_proxy_port: Some(4545),
            codex_app: Some("Codex".to_string()),
        };

        store.save_latest(&status).unwrap();

        assert_eq!(store.load_latest().unwrap(), Some(status));
    }

    #[test]
    fn status_store_load_latest_missing_file_returns_none() {
        let dir = temp_dir();
        let store = StatusStore::new(dir.join("latest-status.json"));

        assert_eq!(store.load_latest().unwrap(), None);
    }

    #[test]
    fn status_store_load_latest_bad_json_returns_none() {
        let dir = temp_dir();
        let path = dir.join("latest-status.json");
        std::fs::write(&path, "{bad json").unwrap();
        let store = StatusStore::new(path);

        assert_eq!(store.load_latest().unwrap(), None);
    }

    #[test]
    fn launch_status_ignores_legacy_helper_port() {
        let status: LaunchStatus = serde_json::from_str(
            r#"{
                "status": "running",
                "message": "ready",
                "started_at_ms": 12345,
                "helper_port": 4545,
                "codex_app": "Codex"
            }"#,
        )
        .unwrap();

        assert_eq!(status.protocol_proxy_port, None);
    }

    #[test]
    fn launch_status_serializes_only_protocol_proxy_port() {
        let status = LaunchStatus {
            status: "running".to_string(),
            message: "ready".to_string(),
            started_at_ms: 12345,
            protocol_proxy_port: Some(4545),
            codex_app: Some("Codex".to_string()),
        };

        let serialized = serde_json::to_value(status).unwrap();

        assert_eq!(serialized["protocol_proxy_port"], 4545);
        assert!(serialized.get("helper_port").is_none());
    }
}
