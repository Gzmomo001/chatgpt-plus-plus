use std::path::{Path, PathBuf};

pub const PRODUCT_NAME: &str = "ChatGPT++";
pub const LEGACY_PRODUCT_NAME: &str = "Codex++";

pub fn env_var_with_legacy(
    current_name: &str,
    legacy_name: &str,
) -> Result<String, std::env::VarError> {
    std::env::var(current_name).or_else(|_| std::env::var(legacy_name))
}

/// Prefer the new branded directory while allowing existing installations to
/// keep using their legacy data in place.
pub fn resolve_branded_config_dir(base: &Path) -> PathBuf {
    let current = base.join(PRODUCT_NAME);
    if current.exists() {
        return current;
    }

    let legacy = base.join(LEGACY_PRODUCT_NAME);
    if legacy.exists() {
        return legacy;
    }

    current
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_dir_prefers_new_brand_directory() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("Codex++")).unwrap();
        std::fs::create_dir(root.path().join("ChatGPT++")).unwrap();

        assert_eq!(
            resolve_branded_config_dir(root.path()),
            root.path().join("ChatGPT++")
        );
    }

    #[test]
    fn config_dir_falls_back_to_legacy_directory() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("Codex++")).unwrap();

        assert_eq!(
            resolve_branded_config_dir(root.path()),
            root.path().join("Codex++")
        );
    }

    #[test]
    fn config_dir_defaults_to_new_brand_directory() {
        let root = tempfile::tempdir().unwrap();

        assert_eq!(
            resolve_branded_config_dir(root.path()),
            root.path().join("ChatGPT++")
        );
    }

    #[test]
    fn environment_lookup_falls_back_to_legacy_name() {
        let suffix = std::process::id();
        let current = format!("CHATGPT_PLUS_TEST_CURRENT_{suffix}");
        let legacy = format!("CODEX_PLUS_TEST_LEGACY_{suffix}");
        unsafe {
            std::env::remove_var(&current);
            std::env::set_var(&legacy, "legacy-value");
        }

        assert_eq!(
            env_var_with_legacy(&current, &legacy).unwrap(),
            "legacy-value"
        );

        unsafe {
            std::env::remove_var(&legacy);
        }
    }
}
