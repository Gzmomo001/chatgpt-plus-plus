import {
  DYNAMIC_PLAIN_LAUNCH_CRASH_TITLE,
  DYNAMIC_TEMPLATE_LAUNCH_CRASH_MESSAGE,
  type DynamicPlainKey,
  type DynamicTemplateKey,
} from "../../i18n/dynamic-keys.ts";
import type { OverviewResult } from "@/shared/contracts/overview";

type HealthItemId = "codex-version" | "codex-app" | "app-shortcut";

export type HealthItem = {
  id: HealthItemId;
  status: string;
  ok: boolean;
  detail: string | null;
};

export type LaunchCrashNotice = {
  title: DynamicPlainKey;
  message: DynamicTemplateKey;
  messageArgs: string[];
  status: string;
};

const TERMINAL_LAUNCH_STATUSES = new Set(["stopped", "failed", "crashed"]);

export function projectOverviewHealth(overview: OverviewResult | null): HealthItem[] {
  return [
    {
      id: "codex-version",
      status: overview?.codexVersion ? "ok" : "not_checked",
      ok: Boolean(overview?.codexVersion),
      detail: overview?.codexVersion ?? null,
    },
    {
      id: "codex-app",
      status: overview?.codexApp.status ?? "not_checked",
      ok: overview?.codexApp.status === "found",
      detail: overview?.codexApp.path ?? null,
    },
    {
      id: "app-shortcut",
      status: overview?.appShortcut.status ?? "not_checked",
      ok: overview?.appShortcut.status === "installed",
      detail: overview?.appShortcut.path ?? null,
    },
  ];
}

export function detectLaunchCrash(previous: string | null, current: string | null | undefined): LaunchCrashNotice | null {
  if (previous !== "running" || !current || !TERMINAL_LAUNCH_STATUSES.has(current)) return null;
  return {
    title: DYNAMIC_PLAIN_LAUNCH_CRASH_TITLE,
    message: DYNAMIC_TEMPLATE_LAUNCH_CRASH_MESSAGE,
    messageArgs: [current],
    status: "failed",
  };
}
