import type { CommandResult } from "./command";

export type UserScript = {
  key: string;
  name: string;
  source: string;
  enabled: boolean;
  status: string;
  error: string;
  market_id?: string;
  version?: string;
  installed?: boolean;
  source_url?: string;
  homepage?: string;
};

export type UserScriptInventory = {
  enabled?: boolean;
  scripts?: UserScript[];
};

export type ScriptMarketItem = {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  homepage: string;
  script_url: string;
  sha256: string;
  installed: boolean;
  installedVersion: string;
  updateAvailable: boolean;
};

export type ScriptMarketResult = CommandResult<{
  market: {
    status: string;
    message: string;
    indexUrl: string;
    updatedAt: string;
    scripts: ScriptMarketItem[];
  };
  userScripts: UserScriptInventory;
}>;
