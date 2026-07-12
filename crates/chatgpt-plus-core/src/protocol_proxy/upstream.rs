use std::time::Duration;

use anyhow::Context;
use serde_json::{Value, json};

use crate::relay_rotation::{RotationContext, RotationEvent};
use crate::settings::{RelayProtocol, SettingsStore};

#[cfg(test)]
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const HEADER_TIMEOUT: Duration = Duration::from_secs(30);
const STREAM_HEADER_TIMEOUT: Duration = Duration::from_secs(120);

pub(super) struct UpstreamProxyResponse {
    pub(super) status_code: u16,
    pub(super) content_type: String,
    pub(super) is_stream: bool,
    pub(super) wire_api: UpstreamWireApi,
    pub(super) response: reqwest::Response,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub(super) enum UpstreamWireApi {
    Responses,
    ChatCompletions,
}

impl UpstreamProxyResponse {
    pub(super) fn status(&self) -> String {
        super::http_status_line(self.status_code)
    }

    pub(super) fn is_success(&self) -> bool {
        (200..300).contains(&self.status_code)
    }
}

#[cfg(test)]
pub(super) fn header_timeout() -> Duration {
    HEADER_TIMEOUT
}

#[cfg(test)]
pub(super) fn stream_header_timeout() -> Duration {
    STREAM_HEADER_TIMEOUT
}

#[cfg(test)]
pub(super) fn http_client() -> anyhow::Result<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .user_agent("ChatGPTPlusPlus/ProtocolProxy")
        .build()
        .context("failed to build upstream HTTP client")
}

pub(super) fn response_header_timeout(is_stream: bool) -> Duration {
    if is_stream {
        STREAM_HEADER_TIMEOUT
    } else {
        HEADER_TIMEOUT
    }
}

pub(super) async fn send_upstream_request(
    request: reqwest::RequestBuilder,
) -> anyhow::Result<reqwest::Response> {
    send_with_header_timeout(request, HEADER_TIMEOUT).await
}

pub(super) async fn send_upstream_request_for_responses(
    request: reqwest::RequestBuilder,
    is_stream: bool,
) -> anyhow::Result<reqwest::Response> {
    send_with_header_timeout(request, response_header_timeout(is_stream)).await
}

pub(super) async fn send_with_header_timeout(
    request: reqwest::RequestBuilder,
    timeout: Duration,
) -> anyhow::Result<reqwest::Response> {
    tokio::time::timeout(timeout, request.send())
        .await
        .with_context(|| format!("上游请求超过 {} 秒未返回响应头", timeout.as_secs()))?
        .context("上游请求失败")
}

pub(super) async fn open_responses(
    body: &str,
    original_user_agent: Option<&str>,
) -> anyhow::Result<UpstreamProxyResponse> {
    let settings = SettingsStore::default().load().unwrap_or_default();
    open_responses_with_settings_and_user_agent(body, settings, original_user_agent).await
}

#[cfg(test)]
pub(super) async fn open_responses_with_settings(
    body: &str,
    settings: crate::settings::BackendSettings,
) -> anyhow::Result<UpstreamProxyResponse> {
    open_responses_with_settings_and_user_agent(body, settings, None).await
}

async fn open_responses_with_settings_and_user_agent(
    body: &str,
    settings: crate::settings::BackendSettings,
    original_user_agent: Option<&str>,
) -> anyhow::Result<UpstreamProxyResponse> {
    let request_json: Value = serde_json::from_str(body)?;
    let is_stream = request_json
        .get("stream")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let context = RotationContext {
        conversation_id: conversation_id(&request_json),
    };
    let relay = crate::relay_rotation::select_relay_for_request(&settings, context)?;
    let mut relays = vec![relay.clone()];
    relays.extend(crate::relay_rotation::fallback_relays_after(
        &settings, &relay.id,
    )?);
    let relay_count = relays.len();
    for (attempt, relay) in relays.into_iter().enumerate() {
        validate(&relay)?;
        let (endpoint, upstream_body, wire_api) = request_parts(&relay, request_json.clone())?;
        let has_more_candidates = attempt + 1 < relay_count;
        let header_timeout = response_header_timeout(is_stream);
        let _ = crate::diagnostic_log::append_diagnostic_log(
            "protocol_proxy.upstream_request",
            json!({
                "relayId": relay.id,
                "relayName": relay.name,
                "endpoint": endpoint,
                "wireApi": wire_api,
                "stream": is_stream,
                "attempt": attempt + 1,
                "candidateCount": relay_count,
                "headerTimeoutSeconds": header_timeout.as_secs()
            }),
        );
        let upstream = match send_upstream_request_for_responses(
            request_builder(
                crate::http_client::proxied_client(&effective_user_agent(
                    &relay.user_agent,
                    original_user_agent,
                ))?,
                &endpoint,
                relay.api_key.trim(),
                is_stream,
                &upstream_body,
            ),
            is_stream,
        )
        .await
        {
            Ok(upstream) => upstream,
            Err(error) => {
                let _ = crate::diagnostic_log::append_diagnostic_log(
                    "protocol_proxy.upstream_request_failed",
                    json!({
                        "relayId": relay.id,
                        "relayName": relay.name,
                        "endpoint": endpoint,
                        "wireApi": wire_api,
                        "stream": is_stream,
                        "attempt": attempt + 1,
                        "candidateCount": relay_count,
                        "headerTimeoutSeconds": header_timeout.as_secs(),
                        "willFailover": has_more_candidates,
                        "error": error.to_string()
                    }),
                );
                crate::relay_rotation::record_relay_request_failure(&settings);
                if has_more_candidates {
                    continue;
                }
                return Err(error).with_context(|| {
                    format!(
                        "供应商「{}」请求上游失败，endpoint: {}",
                        relay.name, endpoint
                    )
                });
            }
        };
        let status_code = upstream.status().as_u16();
        let _ = crate::diagnostic_log::append_diagnostic_log(
            "protocol_proxy.upstream_response",
            json!({
                "relayId": relay.id,
                "relayName": relay.name,
                "endpoint": endpoint,
                "wireApi": wire_api,
                "stream": is_stream,
                "statusCode": status_code,
                "attempt": attempt + 1,
                "candidateCount": relay_count,
                "headerTimeoutSeconds": header_timeout.as_secs(),
                "willFailover": has_more_candidates && !(200..300).contains(&status_code)
            }),
        );
        crate::relay_rotation::record_relay_request_event(
            &settings,
            if (200..300).contains(&status_code) {
                RotationEvent::Success
            } else {
                RotationEvent::Failure
            },
        );
        let content_type = upstream
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        if (200..300).contains(&status_code) || !has_more_candidates {
            return Ok(UpstreamProxyResponse {
                status_code,
                is_stream: is_stream || content_type.contains("text/event-stream"),
                content_type,
                wire_api,
                response: upstream,
            });
        }
        let _ = crate::diagnostic_log::append_diagnostic_log(
            "protocol_proxy.upstream_failover",
            json!({
                "relayId": relay.id,
                "relayName": relay.name,
                "endpoint": endpoint,
                "wireApi": wire_api,
                "stream": is_stream,
                "statusCode": status_code,
                "attempt": attempt + 1,
                "candidateCount": relay_count,
                "headerTimeoutSeconds": header_timeout.as_secs()
            }),
        );
    }
    anyhow::bail!("未找到可用的聚合供应商成员")
}

pub(super) async fn open_models(
    original_user_agent: Option<&str>,
) -> anyhow::Result<UpstreamProxyResponse> {
    let settings = SettingsStore::default().load().unwrap_or_default();
    let relay = crate::relay_rotation::select_relay_for_probe(&settings)?;
    validate(&relay)?;

    let endpoint = super::models_url(&relay.base_url);
    let _ = crate::diagnostic_log::append_diagnostic_log(
        "protocol_proxy.models_request",
        json!({
            "relayId": relay.id,
            "relayName": relay.name,
            "endpoint": endpoint,
            "wireApi": UpstreamWireApi::Responses
        }),
    );
    let upstream = send_upstream_request(
        crate::http_client::proxied_client(&effective_user_agent(
            &relay.user_agent,
            original_user_agent,
        ))?
        .get(endpoint)
        .bearer_auth(relay.api_key.trim()),
    )
    .await?;
    let status_code = upstream.status().as_u16();
    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json; charset=utf-8")
        .to_string();

    Ok(UpstreamProxyResponse {
        status_code,
        is_stream: false,
        content_type,
        wire_api: UpstreamWireApi::Responses,
        response: upstream,
    })
}

pub(super) async fn open_chat_completions(
    body: &str,
    original_user_agent: Option<&str>,
) -> anyhow::Result<UpstreamProxyResponse> {
    let settings = SettingsStore::default().load().unwrap_or_default();
    let relay = settings.active_relay_profile();
    if relay.protocol != RelayProtocol::ChatCompletions {
        anyhow::bail!("当前中转未启用 Chat Completions 协议代理");
    }
    if relay.base_url.trim().is_empty() {
        anyhow::bail!("Chat Completions 上游 Base URL 不能为空");
    }
    if relay.api_key.trim().is_empty() {
        anyhow::bail!("Chat Completions 上游 Key 不能为空");
    }

    let request_json: Value = serde_json::from_str(body)?;
    let is_stream = request_json
        .get("stream")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let upstream = send_upstream_request_for_responses(
        crate::http_client::proxied_client(&effective_user_agent(
            &relay.user_agent,
            original_user_agent,
        ))?
        .post(super::chat_completions_url(&relay.base_url))
        .bearer_auth(relay.api_key.trim())
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&request_json),
        is_stream,
    )
    .await?;
    let status_code = upstream.status().as_u16();
    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();

    Ok(UpstreamProxyResponse {
        status_code,
        is_stream: (200..300).contains(&status_code)
            && (is_stream || content_type.contains("text/event-stream")),
        content_type,
        wire_api: UpstreamWireApi::ChatCompletions,
        response: upstream,
    })
}

fn request_parts(
    relay: &crate::settings::RelayProfile,
    request_json: Value,
) -> anyhow::Result<(String, Value, UpstreamWireApi)> {
    match relay.protocol {
        RelayProtocol::Responses => Ok((
            super::responses_url(&relay.base_url),
            request_json,
            UpstreamWireApi::Responses,
        )),
        RelayProtocol::ChatCompletions => Ok((
            super::chat_completions_url(&relay.base_url),
            super::responses_to_chat_completions(request_json)?,
            UpstreamWireApi::ChatCompletions,
        )),
    }
}

fn request_builder(
    client: reqwest::Client,
    endpoint: &str,
    api_key: &str,
    is_stream: bool,
    upstream_body: &Value,
) -> reqwest::RequestBuilder {
    let mut builder = client
        .post(endpoint)
        .bearer_auth(api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json");
    if is_stream {
        builder = builder
            .header(reqwest::header::ACCEPT, "text/event-stream")
            .header(reqwest::header::CACHE_CONTROL, "no-cache");
    }
    builder.json(upstream_body)
}

fn validate(relay: &crate::settings::RelayProfile) -> anyhow::Result<()> {
    if relay.base_url.trim().is_empty() {
        anyhow::bail!("上游 Base URL 不能为空");
    }
    if relay.api_key.trim().is_empty() {
        anyhow::bail!("上游 Key 不能为空");
    }
    Ok(())
}

fn conversation_id(body: &Value) -> Option<String> {
    for key in ["conversation", "conversation_id", "previous_response_id"] {
        if let Some(value) = body.get(key).and_then(Value::as_str) {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn effective_user_agent(configured_user_agent: &str, original_user_agent: Option<&str>) -> String {
    let configured_user_agent = configured_user_agent.trim();
    if !configured_user_agent.is_empty() {
        return configured_user_agent.to_string();
    }
    original_user_agent
        .map(str::trim)
        .filter(|user_agent| !user_agent.is_empty())
        .unwrap_or("")
        .to_string()
}
