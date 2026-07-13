use chatgpt_plus_core::model_suffix::parse_model_suffix;

#[test]
fn parse_suffix_extracts_k_and_m_units() {
    assert_eq!(
        parse_model_suffix("deepseek-v4-pro[1M]"),
        ("deepseek-v4-pro".to_string(), Some(1_000_000))
    );
    assert_eq!(
        parse_model_suffix("claude-sonnet-4[200K]"),
        ("claude-sonnet-4".to_string(), Some(200_000))
    );
    assert_eq!(
        parse_model_suffix("gpt-5.5[512k]"),
        ("gpt-5.5".to_string(), Some(512_000))
    );
    assert_eq!(
        parse_model_suffix("gpt-5.5[1000000]"),
        ("gpt-5.5".to_string(), Some(1_000_000))
    );
}

#[test]
fn parse_suffix_returns_none_without_bracket() {
    assert_eq!(parse_model_suffix("gpt-5.5"), ("gpt-5.5".to_string(), None));
    assert_eq!(
        parse_model_suffix("  qwen3-coder  "),
        ("qwen3-coder".to_string(), None)
    );
}

#[test]
fn parse_suffix_keeps_original_slug_when_bracket_invalid() {
    // 括号内非合法窗口 token 时，整串（含括号）作为 slug，window=None
    let (slug, window) = parse_model_suffix("foo[bar]");
    assert_eq!(slug, "foo[bar]");
    assert_eq!(window, None);

    // 括号未闭合：不剥离
    let (slug2, window2) = parse_model_suffix("foo[1M");
    assert_eq!(slug2, "foo[1M");
    assert_eq!(window2, None);
}

#[test]
fn parse_suffix_rejects_zero_and_negative() {
    assert_eq!(parse_model_suffix("foo[0K]"), ("foo[0K]".to_string(), None));
}

#[test]
fn migrate_model_list_with_suffixes_splits_slug_and_window() {
    let input = "deepseek-v4-flash[1M]\ndeepseek-v4-pro\nnvidia/...:free[200K]";
    let (clean_list, windows) =
        chatgpt_plus_core::model_suffix::migrate_model_list_with_suffixes(input);
    assert_eq!(
        clean_list,
        "deepseek-v4-flash\ndeepseek-v4-pro\nnvidia/...:free"
    );
    assert_eq!(
        windows.get("deepseek-v4-flash"),
        Some(&"1000000".to_string())
    );
    assert_eq!(windows.get("deepseek-v4-pro"), None);
    assert_eq!(windows.get("nvidia/...:free"), Some(&"200000".to_string()));
}
