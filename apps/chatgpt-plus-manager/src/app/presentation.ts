import {
  Hammer,
  Info,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
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
  enhance: {
    label: t("插件与增强"),
    subtitle: t("管理插件市场与 Codex 启动增强"),
    icon: Hammer,
  },
  maintenance: {
    label: t("安装维护"),
    subtitle: t("入口安装、修复、Watcher 与手动启动"),
    icon: Wrench,
  },
  about: {
    label: t("更新与诊断"),
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

export const navigationGroups = [
  {
    label: t("日常使用"),
    routes: navigationRoutes.filter(({ id }) => ["overview", "relay", "sessions"].includes(id)),
  },
  {
    label: t("Codex 配置"),
    routes: navigationRoutes.filter(({ id }) => id === "enhance"),
  },
  {
    label: t("系统管理"),
    routes: navigationRoutes.filter(({ id }) => ["maintenance", "settings", "about"].includes(id)),
  },
] as const;

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
