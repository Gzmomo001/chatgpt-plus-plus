//! Codex Responses API 与 OpenAI Chat Completions 的本地协议转换。
//!
//! Codex Chat 与 Responses 协议之间的转换实现。

use anyhow::Context;
use serde_json::{Value, json};

#[path = "protocol_proxy/request.rs"]
mod request;
#[path = "protocol_proxy/response.rs"]
mod response;
#[path = "protocol_proxy/routes.rs"]
mod routes;
#[path = "protocol_proxy/stream.rs"]
mod stream;
#[cfg(test)]
#[path = "protocol_proxy/tests.rs"]
mod tests;
#[path = "protocol_proxy/tools.rs"]
mod tools;
#[path = "protocol_proxy/upstream.rs"]
mod upstream;

pub(crate) use request::has_version_suffix;
use request::{
    canonical_json_string, chat_completions_url, http_status_line, models_url,
    response_id_from_chat_id, responses_arguments_to_chat, responses_error_from_upstream,
    responses_to_chat_completions, responses_url,
};
pub use response::ProtocolProxyResponse;
use response::conversion::*;
use stream::{ChatSseToResponsesConverter, ToolCallState, push_sse};
use tools::*;
use upstream::{UpstreamProxyResponse, UpstreamWireApi};
#[cfg(test)]
use upstream::{
    header_timeout as upstream_header_timeout, http_client as upstream_http_client,
    open_chat_completions as open_chat_completions_proxy_request,
    open_models as open_models_proxy_request, open_responses as open_responses_proxy_request,
    open_responses_with_settings as open_responses_proxy_request_with_settings,
    send_with_header_timeout as send_upstream_request_with_header_timeout,
    stream_header_timeout as upstream_stream_header_timeout,
};

pub const DEFAULT_PROTOCOL_PROXY_PORT: u16 = 57321;
const THINK_OPEN_TAG: &str = "<think>";
const THINK_CLOSE_TAG: &str = "</think>";
const EXTRA_CHAT_PASSTHROUGH_FIELDS: &[&str] = &[
    "frequency_penalty",
    "logit_bias",
    "logprobs",
    "metadata",
    "n",
    "presence_penalty",
    "response_format",
    "seed",
    "service_tier",
    "stop",
    "stream_options",
    "top_logprobs",
    "user",
];
const ERROR_BODY_PREVIEW_LIMIT: usize = 1024;

#[derive(Debug, Clone)]
pub struct ProtocolProxyRequest {
    method: String,
    path: String,
    body: Vec<u8>,
    user_agent: Option<String>,
}

impl ProtocolProxyRequest {
    pub fn new(
        method: impl Into<String>,
        path: impl Into<String>,
        body: Vec<u8>,
        user_agent: Option<String>,
    ) -> Self {
        Self {
            method: method.into(),
            path: path.into(),
            body,
            user_agent,
        }
    }
}

pub async fn protocol_proxy_transaction(
    request: ProtocolProxyRequest,
) -> anyhow::Result<Option<ProtocolProxyResponse>> {
    match routes::classify(&request.method, &request.path) {
        Some(routes::ProtocolRoute::ModelsOptions) => Ok(Some(ProtocolProxyResponse::buffered(
            "204 No Content",
            "application/json; charset=utf-8",
            Vec::new(),
        ))),
        Some(routes::ProtocolRoute::Responses) => {
            let body = std::str::from_utf8(&request.body).context("代理请求体不是 UTF-8")?;
            let request_json: Value = serde_json::from_str(body)?;
            let upstream = upstream::open_responses(body, request.user_agent.as_deref()).await?;
            if !upstream.is_success() {
                let status = upstream.status();
                let status_code = upstream.status_code;
                let content_type = upstream.content_type.clone();
                let body = upstream.response.bytes().await?;
                let error = responses_error_from_upstream(status_code, &content_type, &body);
                Ok(Some(ProtocolProxyResponse::buffered(
                    status,
                    "application/json; charset=utf-8",
                    serde_json::to_vec(&error)?,
                )))
            } else if upstream.wire_api == UpstreamWireApi::Responses {
                Ok(Some(ProtocolProxyResponse::upstream(upstream)))
            } else if upstream.wire_api == UpstreamWireApi::ChatCompletions
                && upstream.is_success()
                && !upstream.is_stream
            {
                let status = upstream.status();
                let chat_json: Value = serde_json::from_slice(&upstream.response.bytes().await?)?;
                let response_json =
                    response::chat_completion_to_response_with_request(chat_json, &request_json)?;
                Ok(Some(ProtocolProxyResponse::buffered(
                    status,
                    "application/json; charset=utf-8",
                    serde_json::to_vec(&response_json)?,
                )))
            } else if upstream.wire_api == UpstreamWireApi::ChatCompletions
                && upstream.is_success()
                && upstream.is_stream
            {
                Ok(Some(ProtocolProxyResponse::chat_sse(
                    upstream,
                    &request_json,
                )))
            } else {
                Ok(None)
            }
        }
        Some(routes::ProtocolRoute::Models) => {
            let upstream = upstream::open_models(request.user_agent.as_deref()).await?;
            Ok(Some(ProtocolProxyResponse::upstream(upstream)))
        }
        Some(routes::ProtocolRoute::ChatCompletions) => {
            let body = std::str::from_utf8(&request.body).context("代理请求体不是 UTF-8")?;
            let upstream =
                upstream::open_chat_completions(body, request.user_agent.as_deref()).await?;
            Ok(Some(ProtocolProxyResponse::upstream(upstream)))
        }
        _ => Ok(None),
    }
}

pub fn local_responses_proxy_base_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/v1")
}

#[cfg(test)]
use request::{chat_sse_to_responses_sse, chat_sse_to_responses_sse_with_request};
#[cfg(test)]
use response::{chat_completion_to_response, chat_completion_to_response_with_request};
