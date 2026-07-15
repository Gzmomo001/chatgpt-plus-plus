use async_trait::async_trait;
use chatgpt_plus_core::provider_doctor::{
    ProviderDoctorCheck, ProviderDoctorProbe, diagnose, diagnose_with_probe, recommendation,
};
use chatgpt_plus_core::relay_config::RelayProfileTestResult;
use chatgpt_plus_core::settings::{RelayMode, RelayProfile};

struct FakeProbe {
    models: Result<(Vec<String>, String), &'static str>,
    request: Result<RelayProfileTestResult, &'static str>,
}

#[async_trait]
impl ProviderDoctorProbe for FakeProbe {
    async fn fetch_models(&self, _profile: &RelayProfile) -> anyhow::Result<(Vec<String>, String)> {
        self.models
            .as_ref()
            .map(Clone::clone)
            .map_err(|error| anyhow::anyhow!(*error))
    }

    async fn test_request(
        &self,
        _profile: &RelayProfile,
        _model: &str,
    ) -> anyhow::Result<RelayProfileTestResult> {
        self.request
            .as_ref()
            .map(Clone::clone)
            .map_err(|error| anyhow::anyhow!(*error))
    }
}

fn configured_profile() -> RelayProfile {
    RelayProfile {
        name: "Test Provider".to_string(),
        relay_mode: RelayMode::PureApi,
        base_url: "https://provider.example/v1".to_string(),
        api_key: "secret".to_string(),
        model: "expected-model".to_string(),
        ..RelayProfile::default()
    }
}

fn request(status: u16) -> RelayProfileTestResult {
    RelayProfileTestResult {
        http_status: status,
        endpoint: "https://provider.example/v1/responses".to_string(),
        response_preview: "response".to_string(),
    }
}

#[test]
fn recommendation_prioritizes_configuration_before_request_failures() {
    let checks = vec![
        ProviderDoctorCheck {
            id: "request".to_string(),
            title: "真实请求".to_string(),
            status: "failed".to_string(),
            detail: "HTTP 401".to_string(),
        },
        ProviderDoctorCheck {
            id: "config".to_string(),
            title: "配置完整性".to_string(),
            status: "failed".to_string(),
            detail: "missing key".to_string(),
        },
    ];

    assert!(recommendation(&checks).starts_with("先补齐 Base URL"));
}

#[test]
fn recommendation_prioritizes_model_failures_and_reports_model_warnings() {
    let model_failure = vec![ProviderDoctorCheck {
        id: "models".to_string(),
        title: "模型列表".to_string(),
        status: "failed".to_string(),
        detail: "上游不支持 /v1/models".to_string(),
    }];
    assert!(recommendation(&model_failure).contains("/v1/models"));

    let warning = vec![ProviderDoctorCheck {
        id: "models".to_string(),
        title: "模型列表".to_string(),
        status: "warning".to_string(),
        detail: "未看到默认模型".to_string(),
    }];
    assert!(recommendation(&warning).contains("默认模型"));
}

#[tokio::test]
async fn configured_profile_uses_its_default_model_for_diagnosis() {
    let outcome = diagnose_with_probe(
        &configured_profile(),
        &FakeProbe {
            models: Ok((
                vec!["expected-model".to_string()],
                "https://provider.example/v1/models".to_string(),
            )),
            request: Ok(request(200)),
        },
    )
    .await;

    assert_eq!(outcome.payload.model, "expected-model");
}

#[tokio::test]
async fn official_login_profile_short_circuits_without_upstream_requests() {
    let profile = RelayProfile {
        name: "Official".to_string(),
        relay_mode: RelayMode::Official,
        official_mix_api_key: false,
        ..RelayProfile::default()
    };

    let outcome = diagnose(&profile).await;

    assert_eq!(outcome.status, "ok");
    assert_eq!(outcome.payload.profile_name, "Official");
    assert!(outcome.payload.model.is_empty());
    assert_eq!(outcome.payload.checks.len(), 1);
    assert_eq!(outcome.payload.checks[0].id, "config");
}

#[tokio::test]
async fn configured_profile_reports_empty_models_and_http_failure() {
    let outcome = diagnose_with_probe(
        &configured_profile(),
        &FakeProbe {
            models: Ok((Vec::new(), "https://provider.example/v1/models".to_string())),
            request: Ok(request(401)),
        },
    )
    .await;

    assert_eq!(outcome.status, "failed");
    assert_eq!(
        outcome.payload.summary,
        "发现 2 项失败，Codex 可能无法使用该供应商。"
    );
    assert_eq!(
        outcome
            .payload
            .checks
            .iter()
            .find(|check| check.id == "models")
            .unwrap()
            .status,
        "failed"
    );
    assert_eq!(
        outcome
            .payload
            .checks
            .iter()
            .find(|check| check.id == "request")
            .unwrap()
            .status,
        "failed"
    );
    assert!(outcome.payload.recommendation.contains("/v1/models"));
}

#[tokio::test]
async fn missing_configuration_short_circuits_before_probes() {
    let profile = RelayProfile {
        name: "Missing Key".to_string(),
        relay_mode: RelayMode::PureApi,
        base_url: "https://provider.example/v1".to_string(),
        api_key: String::new(),
        ..RelayProfile::default()
    };
    let outcome = diagnose_with_probe(
        &profile,
        &FakeProbe {
            models: Err("models probe must not run"),
            request: Err("request probe must not run"),
        },
    )
    .await;

    assert_eq!(outcome.status, "failed");
    assert_eq!(outcome.payload.checks.len(), 1);
    assert_eq!(outcome.payload.checks[0].id, "config");
    assert!(
        outcome
            .payload
            .recommendation
            .starts_with("先填写 Base URL")
    );
}

#[tokio::test]
async fn configured_profile_reports_missing_model_as_warning() {
    let outcome = diagnose_with_probe(
        &configured_profile(),
        &FakeProbe {
            models: Ok((
                vec!["different-model".to_string()],
                "https://provider.example/v1/models".to_string(),
            )),
            request: Ok(request(200)),
        },
    )
    .await;

    assert_eq!(outcome.status, "ok");
    assert_eq!(outcome.payload.summary, "基础连接可用，但有 1 项需要确认。");
    assert_eq!(
        outcome
            .payload
            .checks
            .iter()
            .find(|check| check.id == "models")
            .unwrap()
            .status,
        "warning"
    );
    let image_generation = outcome
        .payload
        .checks
        .iter()
        .find(|check| check.id == "image_generation")
        .expect("image generation capability check");
    assert_eq!(image_generation.status, "ok");
    assert!(image_generation.detail.contains("未启用"));
    assert!(outcome.payload.recommendation.contains("默认模型"));
}

#[tokio::test]
async fn disabled_native_image_generation_does_not_treat_listed_image_models_as_compatibility() {
    let outcome = diagnose_with_probe(
        &configured_profile(),
        &FakeProbe {
            models: Ok((
                vec![
                    "expected-model".to_string(),
                    "openai/gpt-image-2".to_string(),
                ],
                "https://provider.example/v1/models".to_string(),
            )),
            request: Ok(request(200)),
        },
    )
    .await;

    let image_generation = outcome
        .payload
        .checks
        .iter()
        .find(|check| check.id == "image_generation")
        .expect("image generation capability check");
    assert_eq!(image_generation.status, "ok");
    assert!(image_generation.detail.contains("未启用"));
    assert!(!image_generation.detail.contains("gpt-image-2"));
}

#[tokio::test]
async fn configured_profile_aggregates_model_and_request_errors() {
    let outcome = diagnose_with_probe(
        &configured_profile(),
        &FakeProbe {
            models: Err("models unavailable"),
            request: Err("request unavailable"),
        },
    )
    .await;

    assert_eq!(outcome.status, "failed");
    assert_eq!(
        outcome.payload.summary,
        "发现 2 项失败，Codex 可能无法使用该供应商。"
    );
    assert!(
        outcome
            .payload
            .checks
            .iter()
            .find(|check| check.id == "models")
            .unwrap()
            .detail
            .contains("models unavailable")
    );
    assert!(
        outcome
            .payload
            .checks
            .iter()
            .find(|check| check.id == "request")
            .unwrap()
            .detail
            .contains("request unavailable")
    );
    assert!(outcome.payload.recommendation.contains("/v1/models"));
}

#[tokio::test]
async fn explicitly_enabled_native_image_generation_reports_all_registration_conditions() {
    let mut profile = configured_profile();
    profile.model = "expected-model".to_string();
    profile.native_image_generation_enabled = true;
    profile.api_key = "sk-do-not-diagnose".to_string();

    let outcome = diagnose_with_probe(
        &profile,
        &FakeProbe {
            models: Ok((
                vec!["expected-model".to_string()],
                "https://provider.example/v1/models".to_string(),
            )),
            request: Ok(request(200)),
        },
    )
    .await;

    for id in [
        "image_generation",
        "native_image_generation_protocol",
        "native_image_generation_provider",
        "native_image_generation_modality",
        "native_image_generation_config",
    ] {
        assert_eq!(
            outcome
                .payload
                .checks
                .iter()
                .find(|check| check.id == id)
                .unwrap()
                .status,
            "ok"
        );
    }
    let payload = serde_json::to_string(&outcome.payload).unwrap();
    assert!(!payload.contains("sk-do-not-diagnose"));
    assert!(payload.contains("未来版本可能变化"));
}

#[tokio::test]
async fn native_image_generation_reports_unsupported_chat_completions_protocol() {
    let mut profile = configured_profile();
    profile.model = "expected-model".to_string();
    profile.protocol = chatgpt_plus_core::settings::RelayProtocol::ChatCompletions;
    profile.native_image_generation_enabled = true;

    let outcome = diagnose_with_probe(
        &profile,
        &FakeProbe {
            models: Ok((
                vec!["expected-model".to_string()],
                "https://provider.example/v1/models".to_string(),
            )),
            request: Ok(request(200)),
        },
    )
    .await;

    let protocol = outcome
        .payload
        .checks
        .iter()
        .find(|check| check.id == "native_image_generation_protocol")
        .unwrap();
    assert_eq!(protocol.status, "failed");
    assert!(protocol.detail.contains("不会代理 /images/generations"));
    assert!(outcome.payload.recommendation.contains("fallback CLI"));
}

#[tokio::test]
async fn native_image_generation_reports_missing_image_modality_for_external_catalog() {
    let mut profile = configured_profile();
    profile.model = "expected-model".to_string();
    profile.native_image_generation_enabled = true;
    profile.config_contents = r#"model = "expected-model"
model_provider = "custom"
model_catalog_json = "/user/catalog.json"

[model_providers.custom]
base_url = "https://provider.example/v1"
wire_api = "responses"
requires_openai_auth = true
"#
    .to_string();

    let outcome = diagnose_with_probe(
        &profile,
        &FakeProbe {
            models: Ok((
                vec!["expected-model".to_string()],
                "https://provider.example/v1/models".to_string(),
            )),
            request: Ok(request(200)),
        },
    )
    .await;

    let modality = outcome
        .payload
        .checks
        .iter()
        .find(|check| check.id == "native_image_generation_modality")
        .unwrap();
    assert_eq!(modality.status, "failed");
    assert!(modality.detail.contains("image 输入模态"));
    assert!(outcome.payload.recommendation.contains("fallback CLI"));
}
