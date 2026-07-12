import type {
  ScriptMarketResult,
  UserScriptInventory,
} from "@/shared/contracts/user-scripts";

export type UserScriptsMarketItemView = {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  homepage: string;
  installed: boolean;
  installedVersion: string;
  updateAvailable: boolean;
};

export type UserScriptsLocalItemView = {
  key: string;
  name: string;
  source: "market" | "builtin" | "user";
  marketVersion: string;
  enabled: boolean;
  status: string;
  canDelete: boolean;
};

export type UserScriptsView = {
  summary: {
    marketScriptCount: number;
    installedCount: number;
    localEnabled: boolean;
    marketMessage: string | null;
  };
  market: {
    status: ScriptMarketResult["status"] | null;
    message: string | null;
    updatedAt: string;
    items: UserScriptsMarketItemView[];
  };
  localItems: UserScriptsLocalItemView[];
};

export function syncMarketInstalledState(
  current: ScriptMarketResult | null,
  userScripts: UserScriptInventory,
): ScriptMarketResult | null {
  if (!current) return current;
  const installed = new Map(
    (userScripts.scripts ?? [])
      .filter((script) => script.market_id)
      .map((script) => [script.market_id || "", script.version || ""]),
  );
  return {
    ...current,
    userScripts,
    market: {
      ...current.market,
      scripts: current.market.scripts.map((script) => {
        const installedVersion = installed.get(script.id) || "";
        return {
          ...script,
          installed: Boolean(installedVersion),
          installedVersion,
          updateAvailable:
            Boolean(installedVersion) && installedVersion !== script.version,
        };
      }),
    },
  };
}

export function projectUserScriptsView(
  inventory: UserScriptInventory | undefined,
  market: ScriptMarketResult | null,
): UserScriptsView {
  const effectiveInventory = inventory ?? {};
  const marketItems =
    market?.market.scripts.map(
      ({
        id,
        name,
        description,
        version,
        author,
        tags,
        homepage,
        installed,
        installedVersion,
        updateAvailable,
      }) => ({
        id,
        name,
        description,
        version,
        author,
        tags,
        homepage,
        installed,
        installedVersion,
        updateAvailable,
      }),
    ) ?? [];

  return {
    summary: {
      marketScriptCount: marketItems.length,
      installedCount: marketItems.filter((script) => script.installed).length,
      localEnabled: effectiveInventory.enabled !== false,
      marketMessage: market?.market.message ?? null,
    },
    market: {
      status: market?.status ?? null,
      message: market?.message ?? null,
      updatedAt: market?.market.updatedAt ?? "",
      items: marketItems,
    },
    localItems:
      effectiveInventory.scripts?.map((script) => ({
        key: script.key,
        name: script.name,
        source: script.market_id
          ? "market"
          : script.source === "builtin"
            ? "builtin"
            : "user",
        marketVersion: script.market_id ? script.version || "" : "",
        enabled: script.enabled,
        status: script.status,
        canDelete: script.source === "user",
      })) ?? [],
  };
}
