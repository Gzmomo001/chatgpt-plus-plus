import type { PluginMarketplaceInventoryResult } from "../../shared/contracts/plugins.ts";

export type PluginInventoryState = "idle" | "loading" | "error" | "empty" | "ready";

export function projectPluginInventoryState(
  inventory: PluginMarketplaceInventoryResult | null,
  pending: string | null,
): PluginInventoryState {
  if (pending) return "loading";
  if (!inventory) return "idle";
  if (inventory.status !== "ok") return "error";
  return inventory.plugins.length ? "ready" : "empty";
}
