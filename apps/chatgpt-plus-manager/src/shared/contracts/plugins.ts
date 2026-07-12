import type { CommandResult } from "./command";

export type PluginMarketplaceInventoryResult = CommandResult<{
  marketplaces: Array<{
    name: string;
    source: string;
    available: boolean;
    pluginCount: number;
  }>;
  plugins: Array<{
    id: string;
    name: string;
    displayName: string;
    description: string;
    marketplace: string;
    installed: boolean;
    enabled: boolean;
    skillCount: number;
  }>;
}>;
