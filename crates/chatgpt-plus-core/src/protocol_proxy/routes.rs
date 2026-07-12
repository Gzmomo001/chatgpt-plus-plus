#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ProtocolRoute {
    Responses,
    ChatCompletions,
    Models,
    ModelsOptions,
}

pub(super) fn classify(method: &str, path: &str) -> Option<ProtocolRoute> {
    let path = path.split_once('?').map_or(path, |(path, _)| path);
    if method == "POST" && is_responses(path) {
        return Some(ProtocolRoute::Responses);
    }
    if method == "POST" && is_chat_completions(path) {
        return Some(ProtocolRoute::ChatCompletions);
    }
    if method == "GET" && is_models(path) {
        return Some(ProtocolRoute::Models);
    }
    if method == "OPTIONS" && is_models(path) {
        return Some(ProtocolRoute::ModelsOptions);
    }
    None
}

pub(super) fn is_responses(path: &str) -> bool {
    matches!(
        path,
        "/responses"
            | "/v1/responses"
            | "/v1/v1/responses"
            | "/codex/v1/responses"
            | "/responses/compact"
            | "/v1/responses/compact"
            | "/v1/v1/responses/compact"
            | "/codex/v1/responses/compact"
    )
}

pub(super) fn is_chat_completions(path: &str) -> bool {
    matches!(
        path,
        "/chat/completions"
            | "/v1/chat/completions"
            | "/v1/v1/chat/completions"
            | "/codex/v1/chat/completions"
    )
}

pub(super) fn is_models(path: &str) -> bool {
    matches!(
        path,
        "/models" | "/v1/models" | "/v1/v1/models" | "/codex/v1/models"
    )
}
