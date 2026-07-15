use async_trait::async_trait;
use serde::Serialize;

use crate::relay_config::RelayProfileTestResult;
use crate::settings::{RelayMode, RelayProfile, RelayProtocol};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDoctorCheck {
    pub id: String,
    pub title: String,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDoctorPayload {
    pub profile_name: String,
    pub model: String,
    pub summary: String,
    pub recommendation: String,
    pub checks: Vec<ProviderDoctorCheck>,
}

#[derive(Debug, Clone)]
pub struct ProviderDoctorOutcome {
    pub status: String,
    pub message: String,
    pub payload: ProviderDoctorPayload,
}

#[async_trait]
pub trait ProviderDoctorProbe: Send + Sync {
    async fn fetch_models(&self, profile: &RelayProfile) -> anyhow::Result<(Vec<String>, String)>;

    async fn test_request(
        &self,
        profile: &RelayProfile,
        model: &str,
    ) -> anyhow::Result<RelayProfileTestResult>;
}

struct LiveProviderDoctorProbe;

#[async_trait]
impl ProviderDoctorProbe for LiveProviderDoctorProbe {
    async fn fetch_models(&self, profile: &RelayProfile) -> anyhow::Result<(Vec<String>, String)> {
        crate::model_catalog::fetch_relay_profile_model_ids(profile).await
    }

    async fn test_request(
        &self,
        profile: &RelayProfile,
        model: &str,
    ) -> anyhow::Result<RelayProfileTestResult> {
        crate::relay_config::test_relay_profile(profile, model).await
    }
}

pub async fn diagnose(profile: &RelayProfile) -> ProviderDoctorOutcome {
    diagnose_with_probe(profile, &LiveProviderDoctorProbe).await
}

pub async fn diagnose_with_probe(
    profile: &RelayProfile,
    probe: &dyn ProviderDoctorProbe,
) -> ProviderDoctorOutcome {
    let profile_name = if profile.name.trim().is_empty() {
        "未命名供应商".to_string()
    } else {
        profile.name.trim().to_string()
    };
    let default_model = crate::relay_config::relay_profile_model(profile);
    let mut checks = Vec::new();

    if profile.relay_mode == RelayMode::Official && !profile.official_mix_api_key {
        checks.push(check(
            "config",
            "配置完整性",
            "ok",
            "官方登录供应商不需要 Base URL / API Key。",
        ));
        return outcome(
            "ok",
            "Provider Doctor：官方登录供应商无需 API 诊断。",
            profile_name,
            default_model,
            "官方登录供应商无需 API 诊断。",
            "如果 Codex 官方账号可用，直接使用官方登录模式即可。",
            checks,
        );
    }

    if crate::relay_config::relay_profile_base_url(profile)
        .trim()
        .is_empty()
        || crate::relay_config::relay_profile_api_key(profile)
            .trim()
            .is_empty()
    {
        checks.push(check(
            "config",
            "配置完整性",
            "failed",
            "Base URL 或 API Key 为空。",
        ));
        return outcome(
            "failed",
            "Provider Doctor：配置不完整。",
            profile_name,
            default_model,
            "配置不完整，无法发起上游诊断。",
            "先填写 Base URL 和 API Key；如果是官方账号，请切换到官方登录模式。",
            checks,
        );
    }

    checks.push(check(
        "config",
        "配置完整性",
        "ok",
        format!(
            "{} / {}",
            crate::relay_config::relay_profile_base_url(profile),
            match profile.protocol {
                RelayProtocol::Responses => "Responses API",
                RelayProtocol::ChatCompletions => "Chat Completions",
            }
        ),
    ));

    let native_image_generation =
        crate::native_image_generation::NativeImageGenerationConfig::from_profile(profile);
    let native_image_diagnosis =
        native_image_generation.diagnosis(native_image_generation.model_modality_will_be_ready());
    checks.extend(
        native_image_diagnosis
            .checks
            .into_iter()
            .map(|native_check| {
                check(
                    native_check.id,
                    native_check.title,
                    native_check.status,
                    native_check.detail,
                )
            }),
    );

    match probe.fetch_models(profile).await {
        Ok((models, endpoint)) => {
            let contains_model = !default_model.trim().is_empty()
                && models.iter().any(|model| model == default_model.trim());
            let status = if models.is_empty() {
                "failed"
            } else if contains_model || default_model.trim().is_empty() {
                "ok"
            } else {
                "warning"
            };
            let detail = if models.is_empty() {
                format!("{endpoint} 返回 0 个模型。")
            } else if contains_model || default_model.trim().is_empty() {
                format!("{endpoint} 返回 {} 个模型。", models.len())
            } else {
                format!(
                    "{endpoint} 返回 {} 个模型，但未看到默认模型「{}」。",
                    models.len(),
                    default_model
                )
            };
            checks.push(check("models", "模型列表", status, detail));
        }
        Err(error) => checks.push(check("models", "模型列表", "failed", error.to_string())),
    }

    match probe.test_request(profile, &default_model).await {
        Ok(result) => {
            let status = if result.http_status < 400 {
                "ok"
            } else {
                "failed"
            };
            let preview = result.response_preview.trim();
            let detail = if preview.is_empty() {
                format!(
                    "{} 返回 HTTP {}，响应内容为空。",
                    result.endpoint, result.http_status
                )
            } else {
                format!(
                    "{} 返回 HTTP {}：{}",
                    result.endpoint, result.http_status, preview
                )
            };
            checks.push(check("request", "真实请求", status, detail));
        }
        Err(error) => checks.push(check("request", "真实请求", "failed", error.to_string())),
    }

    let failed_count = checks
        .iter()
        .filter(|check| check.status == "failed")
        .count();
    let warning_count = checks
        .iter()
        .filter(|check| check.status == "warning")
        .count();
    let status = if failed_count > 0 { "failed" } else { "ok" };
    let summary = if failed_count > 0 {
        format!("发现 {failed_count} 项失败，Codex 可能无法使用该供应商。")
    } else if warning_count > 0 {
        format!("基础连接可用，但有 {warning_count} 项需要确认。")
    } else {
        "供应商基础诊断通过。".to_string()
    };
    let recommendation = recommendation(&checks);
    let message = format!("Provider Doctor：{summary}");
    ProviderDoctorOutcome {
        status: status.to_string(),
        message,
        payload: ProviderDoctorPayload {
            profile_name,
            model: default_model,
            summary,
            recommendation,
            checks,
        },
    }
}

pub fn recommendation(checks: &[ProviderDoctorCheck]) -> String {
    if checks
        .iter()
        .any(|check| check.id.starts_with("native_image_generation_") && check.status == "failed")
    {
        return "Codex 原生图片生成注册条件不完整；继续使用现有 fallback CLI，并先核对 OPENAI_BASE_URL。Provider Doctor 不会为诊断自动生成付费图片。".to_string();
    }
    if checks
        .iter()
        .any(|check| check.id == "config" && check.status == "failed")
    {
        return "先补齐 Base URL 和 API Key；如果使用官方账号，请切换到官方登录模式。".to_string();
    }
    if checks
        .iter()
        .any(|check| check.id == "models" && check.status == "failed")
    {
        return "优先检查 Base URL 是否包含正确的 /v1 前缀，以及供应商是否支持 /v1/models。"
            .to_string();
    }
    if checks
        .iter()
        .any(|check| check.id == "request" && check.status == "failed")
    {
        return "优先检查默认模型名称、上游协议选择和 Key 权限；如果 Chat Completions 可用，请切到对应协议。".to_string();
    }
    if checks.iter().any(|check| check.status == "warning") {
        return "连接可用，但默认模型没有出现在模型列表里；建议把供应商默认模型改为上游返回的模型名。".to_string();
    }
    "可以作为 Codex 供应商使用；如果真实对话仍失败，请查看协议代理日志里的上游响应。".to_string()
}

fn check(
    id: impl Into<String>,
    title: impl Into<String>,
    status: impl Into<String>,
    detail: impl Into<String>,
) -> ProviderDoctorCheck {
    ProviderDoctorCheck {
        id: id.into(),
        title: title.into(),
        status: status.into(),
        detail: detail.into(),
    }
}

fn outcome(
    status: &str,
    message: &str,
    profile_name: String,
    model: String,
    summary: &str,
    recommendation: &str,
    checks: Vec<ProviderDoctorCheck>,
) -> ProviderDoctorOutcome {
    ProviderDoctorOutcome {
        status: status.to_string(),
        message: message.to_string(),
        payload: ProviderDoctorPayload {
            profile_name,
            model,
            summary: summary.to_string(),
            recommendation: recommendation.to_string(),
            checks,
        },
    }
}
