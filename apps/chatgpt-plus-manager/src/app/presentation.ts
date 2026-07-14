import {
  Hammer,
  KeyRound,
  MessageCircle,
  Settings,
  type LucideIcon,
} from "lucide-react";

import type { Status } from "./contracts.ts";
import { ROUTE_IDS, type Route } from "./routes.ts";
import { t } from "../i18n/index.ts";

const routePresentation: Record<
  Route,
  { label: string; subtitle: string; icon: LucideIcon; badge?: string }
> = {
  relay: {
    label: t("供应商配置"),
    subtitle: t("管理 API 供应商、协议、Key 与配置文件"),
    icon: KeyRound,
  },
  sessions: {
    label: t("会话管理"),
    subtitle: t("查看、删除和修复 Codex 本地会话"),
    icon: MessageCircle,
  },
  enhance: {
    label: t("插件与增强"),
    subtitle: t("管理插件市场与 Codex 启动增强"),
    icon: Hammer,
  },
  settings: {
    label: t("设置"),
    subtitle: t("偏好、安装维护、更新与诊断"),
    icon: Settings,
  },
};

const NAVIGATION_ROUTE_IDS: readonly Route[] = ["settings", "relay", "sessions", "enhance"];

export const navigationRoutes = NAVIGATION_ROUTE_IDS.map((id) => ({
  id,
  ...routePresentation[id],
}));

export function routeTitle(route: Route): string {
  return routePresentation[route].label;
}

export function routeSubtitle(route: Route): string {
  return routePresentation[route].subtitle;
}

export type Theme = "dark" | "light";

export function loadInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored =
    window.localStorage.getItem("chatgpt-plus-theme") ??
    window.localStorage.getItem("codex-plus-theme");
  return stored === "light" ? "light" : "dark";
}

export function isSuccessStatus(status?: Status): boolean {
  return status === "ok" || status === "accepted";
}

export function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
