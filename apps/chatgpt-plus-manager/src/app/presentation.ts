import {
  ExternalLink,
  Hammer,
  Info,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  Network,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { Status } from "./contracts.ts";
import { ROUTE_IDS, type Route } from "./routes.ts";
import { t } from "../i18n/index.ts";

const routePresentation: Record<
  Route,
  { label: string; subtitle: string; icon: LucideIcon; badge?: string }
> = {
  overview: {
    label: t("概览"),
    subtitle: t("检查问题、启动与快速修复"),
    icon: LayoutDashboard,
  },
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
  context: {
    label: t("工具与插件"),
    subtitle: t("独立管理 MCP、Skills、Plugins"),
    icon: Network,
  },
  enhance: {
    label: t("Codex增强"),
    subtitle: t("会话删除、导出、项目移动和脚本能力"),
    icon: Hammer,
  },
  recommendations: {
    label: t("推荐内容"),
    subtitle: t("赞助商推荐与普通推荐"),
    icon: ExternalLink,
  },
  maintenance: {
    label: t("安装维护"),
    subtitle: t("入口安装、修复、Watcher 与手动启动"),
    icon: Wrench,
  },
  about: {
    label: t("关于"),
    subtitle: t("版本信息、项目链接、GitHub Release 更新、日志与诊断"),
    icon: Info,
  },
  settings: {
    label: t("设置"),
    subtitle: t("主题和启动参数"),
    icon: Settings,
  },
};

export const navigationRoutes = ROUTE_IDS.map((id) => ({
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
