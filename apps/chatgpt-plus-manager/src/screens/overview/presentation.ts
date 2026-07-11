import type { OverviewResult } from "@/shared/contracts/overview";

type HealthItemId = "codex-version" | "codex-app" | "silent-shortcut" | "management-shortcut";

export type HealthItem = {
  id: HealthItemId;
  status: string;
  ok: boolean;
  detail: string | null;
};

export type LaunchCrashNotice = {
  title: string;
  message: string;
  messageArgs: string[];
  status: string;
};

const TERMINAL_LAUNCH_STATUSES = new Set(["stopped", "failed", "crashed"]);

export function projectOverviewHealth(overview: OverviewResult | null): HealthItem[] {
  return [
    {
      id: "codex-version",
      status: overview?.codex_version ? "ok" : "not_checked",
      ok: Boolean(overview?.codex_version),
      detail: overview?.codex_version ?? null,
    },
    {
      id: "codex-app",
      status: overview?.codex_app.status ?? "not_checked",
      ok: overview?.codex_app.status === "found",
      detail: overview?.codex_app.path ?? null,
    },
    {
      id: "silent-shortcut",
      status: overview?.silent_shortcut.status ?? "not_checked",
      ok: overview?.silent_shortcut.status === "installed",
      detail: overview?.silent_shortcut.path ?? null,
    },
    {
      id: "management-shortcut",
      status: overview?.management_shortcut.status ?? "not_checked",
      ok: overview?.management_shortcut.status === "installed",
      detail: overview?.management_shortcut.path ?? null,
    },
  ];
}

export function detectLaunchCrash(previous: string | null, current: string | null | undefined): LaunchCrashNotice | null {
  if (previous !== "running" || !current || !TERMINAL_LAUNCH_STATUSES.has(current)) return null;
  return {
    title: "Codex 意外停止",
    message: "进程状态：{0}。是否要重新启动？",
    messageArgs: [current],
    status: "failed",
  };
}
