use std::path::{Path, PathBuf};

use anyhow::Context;

use crate::relay_config::{
    RelayStatus, backfill_relay_profile_from_home_with_common, relay_status_from_home,
};
use crate::settings::{BackendSettings, RelayMode, RelayProfile, SettingsStore};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodexHomeDisposition {
    Unchanged,
    Applied,
    Cleared,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexHomeApplyOutcome {
    pub disposition: CodexHomeDisposition,
    pub status: RelayStatus,
    pub backup_path: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelayProfileActivation {
    pub settings: BackendSettings,
    pub home: CodexHomeApplyOutcome,
}

pub fn activate(
    store: &SettingsStore,
    home: &Path,
    requested: BackendSettings,
    target_id: &str,
) -> anyhow::Result<RelayProfileActivation> {
    let original = store.load().context("读取当前供应商设置失败")?;
    let mut selected = requested;
    if !selected.relay_profiles_enabled {
        anyhow::bail!("供应商配置总开关已关闭，未写入 config.toml / auth.json。");
    }
    if !selected
        .relay_profiles
        .iter()
        .any(|profile| profile.id == target_id)
    {
        anyhow::bail!("目标供应商「{target_id}」不存在，未修改当前配置。");
    }

    let previous_id = original.active_relay_id.trim();
    if previous_id != target_id {
        backfill_previous_profile(home, &mut selected, previous_id)?;
    }
    selected.active_relay_id = target_id.to_string();
    let target = selected
        .relay_profiles
        .iter()
        .find(|profile| profile.id == target_id)
        .expect("target existence checked above");
    validate_activation_target(target)?;

    if let Err(error) = store.save(&selected) {
        let _ = store.save(&original);
        return Err(error).context("保存供应商设置失败");
    }

    let activation = (|| {
        let settings = store.load().context("读取供应商设置失败")?;
        let home = reconcile(home, &settings)?;
        Ok(RelayProfileActivation { settings, home })
    })();

    match activation {
        Ok(activation) => Ok(activation),
        Err(error) => {
            if let Err(rollback_error) = store.save(&original) {
                return Err(error).context(format!("恢复原供应商设置失败：{rollback_error}"));
            }
            Err(error)
        }
    }
}

pub fn reconcile(home: &Path, settings: &BackendSettings) -> anyhow::Result<CodexHomeApplyOutcome> {
    if !settings.relay_profiles_enabled {
        anyhow::bail!("供应商配置总开关已关闭，未写入 config.toml / auth.json。");
    }

    let profile = settings.active_relay_profile();
    let (disposition, apply_result) = if profile.relay_mode == RelayMode::Official
        && !profile.official_mix_api_key
    {
        let auth_contents =
            (!profile.auth_contents.trim().is_empty()).then_some(profile.auth_contents.as_str());
        let result =
            crate::relay_config::clear_relay_config_to_home_with_auth_and_computer_use_guard(
                home,
                auth_contents,
                settings.computer_use_guard_enabled,
            )?;
        (CodexHomeDisposition::Cleared, result)
    } else {
        let common_config = combined_common_config(settings);
        let result = crate::relay_config::apply_relay_profile_to_home_with_switch_rules_and_computer_use_guard(
                home,
                &profile,
                &common_config,
                settings.computer_use_guard_enabled,
            )?;
        (CodexHomeDisposition::Applied, result)
    };

    let status = relay_status_from_home(home);
    if profile.relay_mode == RelayMode::PureApi && !status.configured {
        anyhow::bail!(
            "纯 API 配置写入后未检测到完整 custom provider，请检查 config.toml 和供应商 API Key。"
        );
    }

    Ok(CodexHomeApplyOutcome {
        disposition,
        status,
        backup_path: apply_result.backup_path.map(PathBuf::from),
    })
}

fn combined_common_config(settings: &BackendSettings) -> String {
    let sections = [
        settings.relay_common_config_contents.trim(),
        settings.relay_context_config_contents.trim(),
    ]
    .into_iter()
    .filter(|section| !section.is_empty())
    .collect::<Vec<_>>();

    if sections.is_empty() {
        String::new()
    } else {
        crate::relay_config::normalize_config_text(&format!("{}\n", sections.join("\n\n")))
    }
}

fn backfill_previous_profile(
    home: &Path,
    settings: &mut BackendSettings,
    previous_id: &str,
) -> anyhow::Result<()> {
    let profile = settings
        .relay_profiles
        .iter_mut()
        .find(|profile| profile.id == previous_id)
        .with_context(|| "当前供应商已不在配置列表中，已停止切换以避免覆盖用户改动。")?;
    backfill_relay_profile_from_home_with_common(
        home,
        profile,
        &mut settings.relay_context_config_contents,
    )
    .context("回填当前供应商配置失败")
}

fn validate_activation_target(profile: &RelayProfile) -> anyhow::Result<()> {
    let clears_managed_relay =
        profile.relay_mode == RelayMode::Official && !profile.official_mix_api_key;
    if !clears_managed_relay
        && profile.relay_mode != RelayMode::Aggregate
        && profile.config_contents.trim().is_empty()
    {
        anyhow::bail!(
            "供应商「{}」缺少独立 config.toml，已停止切换，避免继续显示上一套配置文件。",
            if profile.name.trim().is_empty() {
                profile.id.as_str()
            } else {
                profile.name.as_str()
            }
        );
    }
    if profile.relay_mode == RelayMode::Official
        && profile.official_mix_api_key
        && serde_json::from_str::<serde_json::Value>(&profile.auth_contents)
            .ok()
            .and_then(|value| {
                value
                    .get("OPENAI_API_KEY")
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .map(str::is_empty)
            })
            == Some(false)
    {
        anyhow::bail!(
            "官方混合 API 不应在 auth.json 中保存 OPENAI_API_KEY。请清理此供应商的 auth.json 后再切换。"
        );
    }
    Ok(())
}
