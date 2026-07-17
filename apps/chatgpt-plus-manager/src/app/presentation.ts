import {
  Hammer,
  Info,
  KeyRound,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

import type { Status } from "./contracts.ts";
import { ROUTE_IDS, type Route } from "./routes.ts";
import { t } from "../i18n/index.ts";
import {
  DYNAMIC_PLAIN_ROUTE_ENHANCE_LABEL,
  DYNAMIC_PLAIN_ROUTE_ENHANCE_SUBTITLE,
  DYNAMIC_PLAIN_ROUTE_RELAY_SUBTITLE,
  DYNAMIC_PLAIN_ROUTE_SESSIONS_SUBTITLE,
} from "../i18n/dynamic-keys.ts";

const routePresentation: Record<
  Route,
  { label: string; subtitle: string; icon: LucideIcon; badge?: string }
> = {
  relay: {
    label: "供应商配置",
    subtitle: DYNAMIC_PLAIN_ROUTE_RELAY_SUBTITLE,
    icon: KeyRound,
  },
  sessions: {
    label: "会话管理",
    subtitle: DYNAMIC_PLAIN_ROUTE_SESSIONS_SUBTITLE,
    icon: MessageCircle,
  },
  enhance: {
    label: DYNAMIC_PLAIN_ROUTE_ENHANCE_LABEL,
    subtitle: DYNAMIC_PLAIN_ROUTE_ENHANCE_SUBTITLE,
    icon: Hammer,
  },
  settings: {
    label: "关于",
    subtitle: "版本、更新与支持",
    icon: Info,
  },
};

const NAVIGATION_ROUTE_IDS: readonly Route[] = ["settings", "relay", "sessions", "enhance"];

export function getNavigationRoutes() {
  return NAVIGATION_ROUTE_IDS.map((id) => ({
    id,
    ...routePresentation[id],
    label: t(routePresentation[id].label),
    subtitle: t(routePresentation[id].subtitle),
  }));
}

export function routeTitle(route: Route): string {
  return t(routePresentation[route].label);
}

export function routeSubtitle(route: Route): string {
  return t(routePresentation[route].subtitle);
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
