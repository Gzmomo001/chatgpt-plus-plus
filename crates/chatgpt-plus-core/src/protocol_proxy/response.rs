enum ResponseBody {
    Buffered(Option<Vec<u8>>),
    Upstream(reqwest::Response),
    ChatSse {
        upstream: reqwest::Response,
        converter: super::ChatSseToResponsesConverter,
        done: bool,
    },
}

pub struct ProtocolProxyResponse {
    status: String,
    content_type: String,
    is_stream: bool,
    success: bool,
    upstream_done: bool,
    body: ResponseBody,
}

impl ProtocolProxyResponse {
    pub(super) fn buffered(
        status: impl Into<String>,
        content_type: impl Into<String>,
        body: Vec<u8>,
    ) -> Self {
        let status = status.into();
        Self {
            success: status.starts_with('2'),
            status,
            content_type: content_type.into(),
            is_stream: false,
            upstream_done: false,
            body: ResponseBody::Buffered((!body.is_empty()).then_some(body)),
        }
    }

    pub(super) fn upstream(upstream: super::UpstreamProxyResponse) -> Self {
        let status = upstream.status();
        let success = upstream.is_success();
        let content_type = if upstream.content_type.is_empty() {
            "application/json; charset=utf-8".to_string()
        } else {
            upstream.content_type
        };
        Self {
            status,
            content_type,
            is_stream: upstream.is_stream,
            success,
            upstream_done: false,
            body: ResponseBody::Upstream(upstream.response),
        }
    }

    pub(super) fn chat_sse(
        upstream: super::UpstreamProxyResponse,
        request: &serde_json::Value,
    ) -> Self {
        Self {
            status: upstream.status(),
            content_type: "text/event-stream; charset=utf-8".to_string(),
            is_stream: true,
            success: true,
            upstream_done: false,
            body: ResponseBody::ChatSse {
                upstream: upstream.response,
                converter: super::ChatSseToResponsesConverter::with_request(request),
                done: false,
            },
        }
    }

    pub fn status(&self) -> &str {
        &self.status
    }

    pub fn content_type(&self) -> &str {
        &self.content_type
    }

    pub fn is_stream(&self) -> bool {
        self.is_stream
    }

    pub fn is_success(&self) -> bool {
        self.success
    }

    pub async fn next_chunk(&mut self) -> anyhow::Result<Option<Vec<u8>>> {
        match &mut self.body {
            ResponseBody::Buffered(body) => Ok(body.take()),
            ResponseBody::Upstream(response) => {
                if self.upstream_done {
                    return Ok(None);
                }
                match response.chunk().await {
                    Ok(chunk) => Ok(chunk.map(|chunk| chunk.to_vec())),
                    Err(error) => {
                        self.success = false;
                        if self.is_stream {
                            self.upstream_done = true;
                            Ok(None)
                        } else {
                            Err(error.into())
                        }
                    }
                }
            }
            ResponseBody::ChatSse {
                upstream,
                converter,
                done,
            } => {
                if *done {
                    return Ok(None);
                }
                loop {
                    match upstream.chunk().await {
                        Ok(Some(chunk)) => {
                            let converted = converter.push_bytes(&chunk);
                            if converter.is_failed() {
                                self.success = false;
                            }
                            if !converted.is_empty() {
                                return Ok(Some(converted));
                            }
                        }
                        Ok(None) => {
                            *done = true;
                            let tail = converter.finish();
                            return Ok((!tail.is_empty()).then_some(tail));
                        }
                        Err(error) => {
                            *done = true;
                            self.success = false;
                            let failed = converter.fail(
                                format!("Stream error: {error}"),
                                Some("stream_error".to_string()),
                            );
                            return Ok((!failed.is_empty()).then_some(failed));
                        }
                    }
                }
            }
        }
    }
}
#[cfg(test)]
pub(super) fn chat_completion_to_response(body: Value) -> anyhow::Result<Value> {
    chat_completion_to_response_with_context(body, &CodexToolContext::default(), None)
}

pub(super) fn chat_completion_to_response_with_request(
    body: Value,
    original_request: &Value,
) -> anyhow::Result<Value> {
    let context = build_codex_tool_context(original_request.get("tools"));
    chat_completion_to_response_with_context(body, &context, Some(original_request))
}

fn chat_completion_to_response_with_context(
    body: Value,
    tool_context: &CodexToolContext,
    original_request: Option<&Value>,
) -> anyhow::Result<Value> {
    let choices = body
        .get("choices")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow::anyhow!("chat response missing choices"))?;
    let choice = choices
        .first()
        .ok_or_else(|| anyhow::anyhow!("chat response choices is empty"))?;
    let message = choice
        .get("message")
        .ok_or_else(|| anyhow::anyhow!("chat response choice missing message"))?;

    let response_id = response_id_from_chat_id(body.get("id").and_then(Value::as_str));
    let mut output = Vec::new();
    if let Some(reasoning) = chat_reasoning_to_response_output_item(message, &response_id) {
        output.push(reasoning);
    }
    if let Some(message) = chat_message_to_response_output_item(message, &response_id) {
        output.push(message);
    }
    output.extend(chat_tool_calls_to_response_output_items(
        message,
        tool_context,
    ));

    let mut response = json!({
        "id": response_id,
        "object": "response",
        "created_at": body.get("created").and_then(Value::as_u64).unwrap_or(0),
        "status": response_status(choice.get("finish_reason").and_then(Value::as_str)),
        "model": body.get("model").and_then(Value::as_str).unwrap_or(""),
        "output": output,
        "usage": chat_usage_to_responses_usage(body.get("usage"))
    });

    if choice.get("finish_reason").and_then(Value::as_str) == Some("length") {
        response["incomplete_details"] = json!({ "reason": "max_output_tokens" });
    }
    copy_response_request_fields(&mut response, original_request);

    Ok(response)
}
use serde_json::{Value, json};

use super::{CodexToolContext, build_codex_tool_context, response_id_from_chat_id};
use conversion::{
    chat_message_to_response_output_item, chat_reasoning_to_response_output_item,
    chat_tool_calls_to_response_output_items, chat_usage_to_responses_usage,
    copy_response_request_fields, response_status,
};
pub(super) mod conversion {
    use super::super::*;

    pub(in crate::protocol_proxy) fn chat_reasoning_to_response_output_item(
        message: &Value,
        response_id: &str,
    ) -> Option<Value> {
        let reasoning = chat_reasoning_text(message)?;
        if reasoning.is_empty() {
            return None;
        }
        Some(json!({
            "id": format!("rs_{response_id}"),
            "type": "reasoning",
            "reasoning_content": reasoning,
            "summary": [{ "type": "summary_text", "text": reasoning }]
        }))
    }

    pub(in crate::protocol_proxy) fn chat_reasoning_text(message: &Value) -> Option<String> {
        if let Some(reasoning) = extract_reasoning_field_text(message) {
            return Some(reasoning);
        }

        if let Some(content) = message.get("content").and_then(Value::as_str) {
            if let Some((reasoning, _answer)) = split_leading_think_block(content) {
                if !reasoning.is_empty() {
                    return Some(reasoning);
                }
            }
        }

        None
    }

    pub(in crate::protocol_proxy) fn chat_message_to_response_output_item(
        message: &Value,
        response_id: &str,
    ) -> Option<Value> {
        let mut content = Vec::new();
        if let Some(text) = message.get("content").and_then(Value::as_str) {
            let text = split_leading_think_block(text)
                .map(|(_reasoning, answer)| answer)
                .unwrap_or_else(|| text.to_string());
            if !text.is_empty() {
                content.push(json!({ "type": "output_text", "text": text, "annotations": [] }));
            }
        } else if let Some(parts) = message.get("content").and_then(Value::as_array) {
            for part in parts {
                match part.get("type").and_then(Value::as_str).unwrap_or("") {
                    "text" | "output_text" => {
                        if let Some(text) = part.get("text").and_then(Value::as_str) {
                            if !text.is_empty() {
                                content.push(
                                    json!({ "type": "output_text", "text": text, "annotations": [] }),
                                );
                            }
                        }
                    }
                    "refusal" => {
                        if let Some(refusal) = part.get("refusal").and_then(Value::as_str) {
                            if !refusal.is_empty() {
                                content.push(json!({ "type": "refusal", "refusal": refusal }));
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        if let Some(refusal) = message.get("refusal").and_then(Value::as_str) {
            if !refusal.is_empty() {
                content.push(json!({ "type": "refusal", "refusal": refusal }));
            }
        }

        if content.is_empty() {
            return None;
        }

        Some(json!({
            "id": format!("{response_id}_msg"),
            "type": "message",
            "status": "completed",
            "role": "assistant",
            "content": content
        }))
    }

    pub(in crate::protocol_proxy) fn chat_tool_calls_to_response_output_items(
        message: &Value,
        tool_context: &CodexToolContext,
    ) -> Vec<Value> {
        let mut output = Vec::new();
        if let Some(tool_calls) = message.get("tool_calls").and_then(Value::as_array) {
            for (index, tool_call) in tool_calls.iter().enumerate() {
                output.push(chat_tool_call_to_response_item(
                    tool_call,
                    index,
                    tool_context,
                ));
            }
        } else if let Some(function_call) = message.get("function_call") {
            output.push(chat_legacy_function_call_to_response_item(
                function_call,
                tool_context,
            ));
        }
        output
    }

    pub(in crate::protocol_proxy) fn chat_tool_call_to_response_item(
        tool_call: &Value,
        index: usize,
        tool_context: &CodexToolContext,
    ) -> Value {
        let call_id = tool_call
            .get("id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("call_{index}"));
        let function = tool_call.get("function").unwrap_or(&Value::Null);
        let name = function.get("name").and_then(Value::as_str).unwrap_or("");
        let arguments =
            responses_arguments_to_chat(function.get("arguments").unwrap_or(&json!({})));
        response_tool_call_item(&call_id, name, &arguments, tool_context)
    }

    pub(in crate::protocol_proxy) fn chat_legacy_function_call_to_response_item(
        function_call: &Value,
        tool_context: &CodexToolContext,
    ) -> Value {
        let call_id = function_call
            .get("id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or("call_0");
        let name = function_call
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("");
        let arguments =
            responses_arguments_to_chat(function_call.get("arguments").unwrap_or(&json!({})));
        response_tool_call_item(call_id, name, &arguments, tool_context)
    }

    pub(in crate::protocol_proxy) fn tool_call_added_item(
        state: &ToolCallState,
        output_index: u32,
        tool_context: &CodexToolContext,
    ) -> Value {
        if tool_context.is_custom_tool_proxy(&state.name) {
            return json!({
                "type": "response.output_item.added",
                "output_index": output_index,
                "item": {
                    "id": format!("ctc_{}", state.call_id),
                    "type": "custom_tool_call",
                    "status": "in_progress",
                    "call_id": state.call_id,
                    "name": tool_context.original_custom_tool_name(&state.name),
                    "input": ""
                }
            });
        }
        let (display_name, namespace) = tool_context.openai_name_for_function_tool(&state.name);
        let mut item = json!({
            "type": "response.output_item.added",
            "output_index": output_index,
            "item": {
                "id": state.item_id,
                "type": "function_call",
                "status": "in_progress",
                "call_id": state.call_id,
                "name": display_name,
                "arguments": ""
            }
        });
        if !namespace.is_empty() {
            item["item"]["namespace"] = json!(namespace);
        }
        item
    }

    pub(in crate::protocol_proxy) fn push_tool_call_delta_sse(
        output: &mut String,
        state: &ToolCallState,
        output_index: u32,
        delta: &str,
        tool_context: &CodexToolContext,
    ) {
        if tool_context.is_custom_tool_proxy(&state.name) {
            let _ = delta;
        } else {
            push_sse(
                output,
                "response.function_call_arguments.delta",
                json!({
                    "type": "response.function_call_arguments.delta",
                    "item_id": state.item_id,
                    "output_index": output_index,
                    "delta": delta
                }),
            );
        }
    }

    pub(in crate::protocol_proxy) fn push_tool_call_done_sse(
        output: &mut String,
        state: &ToolCallState,
        output_index: u32,
        tool_context: &CodexToolContext,
    ) {
        if tool_context.is_custom_tool_proxy(&state.name) {
            push_sse(
                output,
                "response.custom_tool_call_input.delta",
                json!({
                    "type": "response.custom_tool_call_input.delta",
                    "item_id": format!("ctc_{}", state.call_id),
                    "call_id": state.call_id,
                    "output_index": output_index,
                    "delta": reconstruct_custom_tool_call_input_with_context(
                        tool_context,
                        &state.name,
                        &state.arguments
                    )
                }),
            );
            return;
        }
        push_sse(
            output,
            "response.function_call_arguments.done",
            json!({
                "type": "response.function_call_arguments.done",
                "item_id": state.item_id,
                "output_index": output_index,
                "arguments": state.arguments
            }),
        );
    }

    pub(in crate::protocol_proxy) fn tool_call_done_item(
        state: &ToolCallState,
        tool_context: &CodexToolContext,
    ) -> Value {
        response_tool_call_item(&state.call_id, &state.name, &state.arguments, tool_context)
    }

    pub(in crate::protocol_proxy) fn response_tool_call_item(
        call_id: &str,
        name: &str,
        arguments: &str,
        tool_context: &CodexToolContext,
    ) -> Value {
        if tool_context.is_custom_tool_proxy(name) {
            return json!({
                "id": format!("ctc_{call_id}"),
                "type": "custom_tool_call",
                "status": "completed",
                "call_id": call_id,
                "name": tool_context.original_custom_tool_name(name),
                "input": reconstruct_custom_tool_call_input_with_context(tool_context, name, arguments)
            });
        }
        let (display_name, namespace) = tool_context.openai_name_for_function_tool(name);
        let mut item = json!({
            "id": format!("fc_{call_id}"),
            "type": "function_call",
            "status": "completed",
            "call_id": call_id,
            "name": display_name,
            "arguments": arguments
        });
        if !namespace.is_empty() {
            item["namespace"] = json!(namespace);
        }
        item
    }

    pub(in crate::protocol_proxy) fn split_leading_think_block(
        text: &str,
    ) -> Option<(String, String)> {
        let leading_ws_len = text.len() - text.trim_start().len();
        let after_ws = &text[leading_ws_len..];
        if !after_ws.starts_with(THINK_OPEN_TAG) {
            return None;
        }
        let body_start = leading_ws_len + THINK_OPEN_TAG.len();
        let close_relative = text[body_start..].find(THINK_CLOSE_TAG)?;
        let close_start = body_start + close_relative;
        let answer_start = close_start + THINK_CLOSE_TAG.len();
        Some((
            text[body_start..close_start].trim().to_string(),
            strip_think_answer_separator(&text[answer_start..]).to_string(),
        ))
    }

    pub(in crate::protocol_proxy) fn strip_leading_think_open_tag(text: &str) -> Option<String> {
        let leading_ws_len = text.len() - text.trim_start().len();
        let after_ws = &text[leading_ws_len..];
        after_ws
            .strip_prefix(THINK_OPEN_TAG)
            .map(|value| value.trim().to_string())
    }

    pub(in crate::protocol_proxy) fn strip_think_answer_separator(text: &str) -> &str {
        text.trim_start_matches(['\r', '\n', '\t', ' '])
    }

    pub(in crate::protocol_proxy) fn extract_reasoning_field_text(value: &Value) -> Option<String> {
        for key in ["reasoning_content", "reasoning"] {
            if let Some(text) = value.get(key).and_then(Value::as_str) {
                if !text.is_empty() {
                    return Some(text.to_string());
                }
            }
        }

        if let Some(reasoning) = value.get("reasoning") {
            for key in ["content", "text", "summary"] {
                if let Some(text) = reasoning.get(key).and_then(Value::as_str) {
                    if !text.is_empty() {
                        return Some(text.to_string());
                    }
                }
            }
        }

        value
            .get("reasoning_details")
            .and_then(extract_reasoning_details_text)
    }

    pub(in crate::protocol_proxy) fn extract_reasoning_details_text(
        value: &Value,
    ) -> Option<String> {
        match value {
            Value::String(text) => (!text.is_empty()).then(|| text.to_string()),
            Value::Array(parts) => {
                let text = parts
                    .iter()
                    .filter_map(extract_reasoning_detail_part_text)
                    .filter(|text| !text.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                (!text.is_empty()).then_some(text)
            }
            Value::Object(_) => extract_reasoning_detail_part_text(value),
            _ => None,
        }
    }

    pub(in crate::protocol_proxy) fn extract_reasoning_detail_part_text(
        value: &Value,
    ) -> Option<String> {
        for key in ["text", "content", "summary"] {
            if let Some(text) = value.get(key).and_then(Value::as_str) {
                if !text.is_empty() {
                    return Some(text.to_string());
                }
            }
        }

        if let Some(parts) = value.get("parts").and_then(Value::as_array) {
            let text = parts
                .iter()
                .filter_map(extract_reasoning_detail_part_text)
                .filter(|text| !text.is_empty())
                .collect::<Vec<_>>()
                .join("\n\n");
            return (!text.is_empty()).then_some(text);
        }

        None
    }

    pub(in crate::protocol_proxy) fn extract_reasoning_summary_text(
        value: &Value,
    ) -> Option<String> {
        for key in ["reasoning_content", "content", "text"] {
            if let Some(text) = value.get(key).and_then(Value::as_str) {
                if !text.is_empty() {
                    return Some(text.to_string());
                }
            }
        }

        let summary = value.get("summary")?;
        if let Some(text) = summary.as_str() {
            return (!text.is_empty()).then(|| text.to_string());
        }

        let parts = summary.as_array()?;
        let text = parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .and_then(Value::as_str)
                    .or_else(|| part.get("content").and_then(Value::as_str))
                    .or_else(|| part.as_str())
            })
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n");

        (!text.is_empty()).then_some(text)
    }

    pub(in crate::protocol_proxy) fn default_responses_usage() -> Value {
        json!({ "input_tokens": 0, "output_tokens": 0, "total_tokens": 0 })
    }

    pub(in crate::protocol_proxy) fn chat_usage_to_responses_usage(usage: Option<&Value>) -> Value {
        let Some(usage) = usage.filter(|value| value.is_object() && !value.is_null()) else {
            return default_responses_usage();
        };
        let mut input_tokens = usage
            .get("prompt_tokens")
            .or_else(|| usage.get("input_tokens"))
            .or_else(|| usage.get("promptTokenCount"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let mut input_tokens_include_cache = usage.get("prompt_tokens").is_some();
        let output_tokens = usage
            .get("completion_tokens")
            .or_else(|| usage.get("output_tokens"))
            .or_else(|| usage.get("candidatesTokenCount"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let mut cached_tokens = usage
            .pointer("/prompt_tokens_details/cached_tokens")
            .or_else(|| usage.pointer("/input_tokens_details/cached_tokens"))
            .or_else(|| usage.get("cachedContentTokenCount"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let cache_creation = usage
            .get("cache_creation_input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let cache_creation_5m = usage
            .get("cache_creation_5m_input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let cache_creation_1h = usage
            .get("cache_creation_1h_input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let has_claude_cache_fields = usage.get("cache_read_input_tokens").is_some()
            || usage.get("cache_creation_input_tokens").is_some()
            || usage.get("cache_creation_5m_input_tokens").is_some()
            || usage.get("cache_creation_1h_input_tokens").is_some();
        let has_cache_details = cached_tokens > 0
            || usage
                .pointer("/prompt_tokens_details/cached_tokens")
                .is_some()
            || usage
                .pointer("/input_tokens_details/cached_tokens")
                .is_some();

        if let Some(value) = usage.get("input_tokens").and_then(Value::as_u64) {
            input_tokens = value;
            input_tokens_include_cache = false;
        }
        if let Some(cache_read) = usage.get("cache_read_input_tokens").and_then(Value::as_u64) {
            cached_tokens = cache_read;
        }
        if let Some(prompt_tokens) = usage.get("promptTokenCount").and_then(Value::as_u64) {
            cached_tokens = usage
                .get("cachedContentTokenCount")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            input_tokens = prompt_tokens.saturating_sub(cached_tokens);
            input_tokens_include_cache = false;
        }

        let usage_input_tokens = if input_tokens_include_cache {
            input_tokens.saturating_sub(
                cached_tokens
                    + effective_cache_creation_tokens(
                        cache_creation,
                        cache_creation_5m,
                        cache_creation_1h,
                    ),
            )
        } else {
            input_tokens
        };
        let should_recalculate_total = usage.get("total_tokens").is_none()
            || cached_tokens > 0
            || effective_cache_creation_tokens(
                cache_creation,
                cache_creation_5m,
                cache_creation_1h,
            ) > 0
            || usage.get("promptTokenCount").is_some();
        let total_tokens = if should_recalculate_total {
            usage_input_tokens
                + output_tokens
                + cached_tokens
                + effective_cache_creation_tokens(
                    cache_creation,
                    cache_creation_5m,
                    cache_creation_1h,
                )
        } else {
            usage
                .get("total_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(usage_input_tokens + output_tokens)
        };
        let mut result = json!({
            "input_tokens": usage_input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens
        });

        if !has_claude_cache_fields && has_cache_details && cached_tokens > 0 {
            result["input_tokens_details"] = json!({ "cached_tokens": cached_tokens });
        }
        if let Some(details) = usage.get("completion_tokens_details") {
            result["output_tokens_details"] = details.clone();
        }
        if let Some(cache_read) = usage.get("cache_read_input_tokens") {
            result["cache_read_input_tokens"] = cache_read.clone();
        }
        if let Some(cache_creation) = usage.get("cache_creation_input_tokens") {
            result["cache_creation_input_tokens"] = cache_creation.clone();
        }
        if let Some(cache_creation) = usage.get("cache_creation_5m_input_tokens") {
            result["cache_creation_5m_input_tokens"] = cache_creation.clone();
        }
        if let Some(cache_creation) = usage.get("cache_creation_1h_input_tokens") {
            result["cache_creation_1h_input_tokens"] = cache_creation.clone();
        }
        let cache_ttl = match (cache_creation_5m > 0, cache_creation_1h > 0) {
            (true, true) => Some("mixed"),
            (true, false) => Some("5m"),
            (false, true) => Some("1h"),
            (false, false) => None,
        };
        if let Some(cache_ttl) = cache_ttl {
            result["cache_ttl"] = json!(cache_ttl);
        }
        result
    }

    pub(in crate::protocol_proxy) fn effective_cache_creation_tokens(
        cache_creation: u64,
        cache_creation_5m: u64,
        cache_creation_1h: u64,
    ) -> u64 {
        if cache_creation > 0 {
            cache_creation
        } else {
            cache_creation_5m + cache_creation_1h
        }
    }

    pub(in crate::protocol_proxy) fn response_status(finish_reason: Option<&str>) -> &'static str {
        match finish_reason {
            Some("length") => "incomplete",
            _ => "completed",
        }
    }

    pub(in crate::protocol_proxy) fn response_output_text(value: &Value) -> String {
        match value {
            Value::String(text) => text.clone(),
            Value::Null => String::new(),
            other => canonical_json_string(other),
        }
    }

    pub(in crate::protocol_proxy) fn build_custom_tool_call_history(
        name: &str,
        input: &Value,
    ) -> (String, String) {
        let input = response_output_text(input);
        if name == "apply_patch" || input.starts_with("*** Begin Patch") {
            let operations = parse_apply_patch_operations(&input);
            if operations.len() == 1 {
                let action = operations[0]
                    .get("type")
                    .and_then(Value::as_str)
                    .and_then(single_apply_patch_action)
                    .unwrap_or(CodexPatchProxyAction::Batch);
                return (
                    format!("{name}_{}", action.suffix()),
                    build_apply_patch_operation_arguments(&operations[0], action),
                );
            }
            return (
                format!("{name}_batch"),
                json!({ "operations": operations, "raw_patch": input }).to_string(),
            );
        }
        (name.to_string(), json!({ "input": input }).to_string())
    }

    pub(in crate::protocol_proxy) fn reconstruct_custom_tool_call_input_with_context(
        tool_context: &CodexToolContext,
        upstream_name: &str,
        arguments: &str,
    ) -> String {
        if let Some(spec) = tool_context.custom_tools.get(upstream_name) {
            if spec.kind == CodexCustomToolKind::ApplyPatch {
                return reconstruct_apply_patch_input(spec.proxy_action, arguments);
            }
        }
        reconstruct_custom_tool_call_input(arguments)
    }

    pub(in crate::protocol_proxy) fn reconstruct_custom_tool_call_input(arguments: &str) -> String {
        let Ok(value) = serde_json::from_str::<Value>(arguments) else {
            return arguments.to_string();
        };
        value
            .get("input")
            .map(response_output_text)
            .unwrap_or_else(|| arguments.to_string())
    }

    pub(in crate::protocol_proxy) fn reconstruct_apply_patch_input(
        action: Option<CodexPatchProxyAction>,
        arguments: &str,
    ) -> String {
        let Ok(value) = serde_json::from_str::<Value>(arguments) else {
            return arguments.to_string();
        };
        if let Some(raw_patch) = value
            .get("raw_patch")
            .or_else(|| value.get("patch"))
            .or_else(|| value.get("input"))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        {
            return raw_patch.to_string();
        }

        let operations = match action.unwrap_or(CodexPatchProxyAction::Batch) {
            CodexPatchProxyAction::AddFile => vec![json!({
                "type": "add_file",
                "path": value.get("path").and_then(Value::as_str).unwrap_or(""),
                "content": value.get("content").and_then(Value::as_str).unwrap_or("")
            })],
            CodexPatchProxyAction::DeleteFile => vec![json!({
                "type": "delete_file",
                "path": value.get("path").and_then(Value::as_str).unwrap_or("")
            })],
            CodexPatchProxyAction::UpdateFile => vec![json!({
                "type": "update_file",
                "path": value.get("path").and_then(Value::as_str).unwrap_or(""),
                "move_to": value.get("move_to").and_then(Value::as_str).unwrap_or(""),
                "hunks": value.get("hunks").cloned().unwrap_or_else(|| json!([]))
            })],
            CodexPatchProxyAction::ReplaceFile => vec![json!({
                "type": "replace_file",
                "path": value.get("path").and_then(Value::as_str).unwrap_or(""),
                "content": value.get("content").and_then(Value::as_str).unwrap_or("")
            })],
            CodexPatchProxyAction::Batch => value
                .get("operations")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
        };

        build_apply_patch_text(&operations)
    }

    pub(in crate::protocol_proxy) fn build_apply_patch_text(operations: &[Value]) -> String {
        let mut text = String::from("*** Begin Patch");
        for operation in operations {
            let op_type = operation.get("type").and_then(Value::as_str).unwrap_or("");
            let path = operation.get("path").and_then(Value::as_str).unwrap_or("");
            match op_type {
                "add_file" => {
                    text.push_str(&format!("\n*** Add File: {path}"));
                    for line in operation
                        .get("content")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .lines()
                    {
                        text.push_str("\n+");
                        text.push_str(line);
                    }
                }
                "delete_file" => {
                    text.push_str(&format!("\n*** Delete File: {path}"));
                }
                "update_file" => {
                    text.push_str(&format!("\n*** Update File: {path}"));
                    if let Some(move_to) = operation.get("move_to").and_then(Value::as_str) {
                        if !move_to.is_empty() {
                            text.push_str(&format!("\n*** Move to: {move_to}"));
                        }
                    }
                    if let Some(hunks) = operation.get("hunks").and_then(Value::as_array) {
                        for hunk in hunks {
                            let context = hunk.get("context").and_then(Value::as_str).unwrap_or("");
                            if context.is_empty() {
                                text.push_str("\n@@");
                            } else {
                                text.push_str(&format!("\n@@ {context}"));
                            }
                            if let Some(lines) = hunk.get("lines").and_then(Value::as_array) {
                                for line in lines {
                                    text.push('\n');
                                    text.push_str(line_op_prefix(
                                        line.get("op").and_then(Value::as_str).unwrap_or("context"),
                                    ));
                                    text.push_str(
                                        line.get("text").and_then(Value::as_str).unwrap_or(""),
                                    );
                                }
                            }
                        }
                    }
                }
                "replace_file" => {
                    text.push_str(&format!("\n*** Delete File: {path}"));
                    text.push_str(&format!("\n*** Add File: {path}"));
                    for line in operation
                        .get("content")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .lines()
                    {
                        text.push_str("\n+");
                        text.push_str(line);
                    }
                }
                _ => {}
            }
        }
        text.push_str("\n*** End Patch");
        text
    }

    pub(in crate::protocol_proxy) fn line_op_prefix(op: &str) -> &'static str {
        match op {
            "add" => "+",
            "remove" | "delete" => "-",
            _ => " ",
        }
    }

    pub(in crate::protocol_proxy) fn parse_apply_patch_operations(input: &str) -> Vec<Value> {
        let mut operations = Vec::new();
        let mut current: Option<serde_json::Map<String, Value>> = None;
        let mut content_lines: Vec<String> = Vec::new();
        let mut hunks: Vec<Value> = Vec::new();
        let mut current_hunk: Option<serde_json::Map<String, Value>> = None;
        let mut hunk_lines: Vec<Value> = Vec::new();

        let flush_hunk = |current_hunk: &mut Option<serde_json::Map<String, Value>>,
                          hunk_lines: &mut Vec<Value>,
                          hunks: &mut Vec<Value>| {
            if let Some(mut hunk) = current_hunk.take() {
                hunk.insert("lines".to_string(), json!(std::mem::take(hunk_lines)));
                hunks.push(Value::Object(hunk));
            }
        };
        let flush_operation = |current: &mut Option<serde_json::Map<String, Value>>,
                               content_lines: &mut Vec<String>,
                               hunks: &mut Vec<Value>,
                               operations: &mut Vec<Value>| {
            if let Some(mut operation) = current.take() {
                match operation.get("type").and_then(Value::as_str).unwrap_or("") {
                    "add_file" | "replace_file" => {
                        operation.insert("content".to_string(), json!(content_lines.join("\n")));
                    }
                    "update_file" => {
                        operation.insert("hunks".to_string(), json!(std::mem::take(hunks)));
                    }
                    _ => {}
                }
                content_lines.clear();
                operations.push(Value::Object(operation));
            }
        };

        for raw_line in input.lines() {
            if raw_line == "*** Begin Patch" || raw_line == "*** End Patch" {
                continue;
            }
            if let Some(path) = raw_line.strip_prefix("*** Add File: ") {
                flush_hunk(&mut current_hunk, &mut hunk_lines, &mut hunks);
                flush_operation(
                    &mut current,
                    &mut content_lines,
                    &mut hunks,
                    &mut operations,
                );
                current = Some(serde_json::Map::from_iter([
                    ("type".to_string(), json!("add_file")),
                    ("path".to_string(), json!(path)),
                ]));
                continue;
            }
            if let Some(path) = raw_line.strip_prefix("*** Delete File: ") {
                flush_hunk(&mut current_hunk, &mut hunk_lines, &mut hunks);
                flush_operation(
                    &mut current,
                    &mut content_lines,
                    &mut hunks,
                    &mut operations,
                );
                current = Some(serde_json::Map::from_iter([
                    ("type".to_string(), json!("delete_file")),
                    ("path".to_string(), json!(path)),
                ]));
                continue;
            }
            if let Some(path) = raw_line.strip_prefix("*** Update File: ") {
                flush_hunk(&mut current_hunk, &mut hunk_lines, &mut hunks);
                flush_operation(
                    &mut current,
                    &mut content_lines,
                    &mut hunks,
                    &mut operations,
                );
                current = Some(serde_json::Map::from_iter([
                    ("type".to_string(), json!("update_file")),
                    ("path".to_string(), json!(path)),
                ]));
                continue;
            }
            if let Some(path) = raw_line.strip_prefix("*** Move to: ") {
                if let Some(operation) = current.as_mut() {
                    operation.insert("move_to".to_string(), json!(path));
                }
                continue;
            }
            if raw_line.starts_with("@@") {
                flush_hunk(&mut current_hunk, &mut hunk_lines, &mut hunks);
                let context = raw_line.strip_prefix("@@").unwrap_or("").trim().to_string();
                current_hunk = Some(serde_json::Map::from_iter([(
                    "context".to_string(),
                    json!(context),
                )]));
                continue;
            }
            if let Some(operation) = current.as_ref() {
                match operation.get("type").and_then(Value::as_str).unwrap_or("") {
                    "add_file" | "replace_file" => {
                        if let Some(line) = raw_line.strip_prefix('+') {
                            content_lines.push(line.to_string());
                        }
                    }
                    "update_file" => {
                        let (op, text) = match raw_line.chars().next() {
                            Some('+') => ("add", &raw_line[1..]),
                            Some('-') => ("remove", &raw_line[1..]),
                            Some(' ') => ("context", &raw_line[1..]),
                            _ => ("context", raw_line),
                        };
                        hunk_lines.push(json!({ "op": op, "text": text }));
                    }
                    _ => {}
                }
            }
        }

        flush_hunk(&mut current_hunk, &mut hunk_lines, &mut hunks);
        flush_operation(
            &mut current,
            &mut content_lines,
            &mut hunks,
            &mut operations,
        );
        operations
    }

    pub(in crate::protocol_proxy) fn single_apply_patch_action(
        op_type: &str,
    ) -> Option<CodexPatchProxyAction> {
        match op_type {
            "add_file" => Some(CodexPatchProxyAction::AddFile),
            "delete_file" => Some(CodexPatchProxyAction::DeleteFile),
            "update_file" => Some(CodexPatchProxyAction::UpdateFile),
            "replace_file" => Some(CodexPatchProxyAction::ReplaceFile),
            _ => None,
        }
    }

    pub(in crate::protocol_proxy) fn build_apply_patch_operation_arguments(
        operation: &Value,
        action: CodexPatchProxyAction,
    ) -> String {
        match action {
            CodexPatchProxyAction::AddFile | CodexPatchProxyAction::ReplaceFile => json!({
                "content": operation.get("content").and_then(Value::as_str).unwrap_or(""),
                "path": operation.get("path").and_then(Value::as_str).unwrap_or("")
            })
            .to_string(),
            CodexPatchProxyAction::DeleteFile => json!({
                "path": operation.get("path").and_then(Value::as_str).unwrap_or("")
            })
            .to_string(),
            CodexPatchProxyAction::UpdateFile => {
                let mut args = json!({
                    "hunks": operation.get("hunks").cloned().unwrap_or_else(|| json!([])),
                    "path": operation.get("path").and_then(Value::as_str).unwrap_or("")
                });
                if let Some(move_to) = operation.get("move_to").and_then(Value::as_str) {
                    if !move_to.is_empty() {
                        args["move_to"] = json!(move_to);
                    }
                }
                args.to_string()
            }
            CodexPatchProxyAction::Batch => {
                json!({ "operations": [operation.clone()] }).to_string()
            }
        }
    }

    pub(in crate::protocol_proxy) fn copy_response_request_fields(
        response: &mut Value,
        original_request: Option<&Value>,
    ) {
        let Some(original_request) = original_request else {
            return;
        };
        for key in [
            "instructions",
            "max_output_tokens",
            "parallel_tool_calls",
            "previous_response_id",
            "reasoning",
            "temperature",
            "tool_choice",
            "tools",
            "top_p",
            "metadata",
        ] {
            if let Some(value) = original_request.get(key) {
                response[key] = value.clone();
            }
        }
    }
}
