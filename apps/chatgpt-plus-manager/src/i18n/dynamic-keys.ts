// Keys passed through dynamic t()/tf() adapters cannot be discovered at the
// call site. Keep this manifest source-first: every entry must also occur in a
// production producer, and the verifier enforces both producer and catalog
// coverage.
export const DYNAMIC_PLAIN_LAUNCH_CRASH_TITLE = "Codex 意外停止" as const;
export const DYNAMIC_TEMPLATE_LAUNCH_CRASH_MESSAGE = "进程状态：{0}。是否要重新启动？" as const;

export const DYNAMIC_PLAIN_KEYS = [DYNAMIC_PLAIN_LAUNCH_CRASH_TITLE] as const;
export const DYNAMIC_TEMPLATE_KEYS = [DYNAMIC_TEMPLATE_LAUNCH_CRASH_MESSAGE] as const;

export type DynamicPlainKey = (typeof DYNAMIC_PLAIN_KEYS)[number];
export type DynamicTemplateKey = (typeof DYNAMIC_TEMPLATE_KEYS)[number];
