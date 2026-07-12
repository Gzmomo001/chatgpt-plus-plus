import assert from "node:assert/strict";
import test from "node:test";

import type {
  ScriptMarketResult,
  UserScriptInventory,
} from "../../shared/contracts/user-scripts.ts";
import {
  projectUserScriptsView,
  syncMarketInstalledState,
} from "./presentation.ts";

const market: ScriptMarketResult = {
  status: "ok",
  message: "fresh",
  market: {
    status: "ok",
    message: "loaded",
    indexUrl: "https://example.test/index.json",
    updatedAt: "2026-07-12",
    scripts: [
      {
        id: "alpha",
        name: "Alpha",
        description: "first",
        version: "2.0.0",
        author: "A",
        tags: ["one"],
        homepage: "https://example.test/alpha",
        script_url: "https://example.test/alpha.js",
        sha256: "aaa",
        installed: false,
        installedVersion: "",
        updateAvailable: false,
      },
      {
        id: "beta",
        name: "Beta",
        description: "second",
        version: "1.0.0",
        author: "B",
        tags: ["two"],
        homepage: "",
        script_url: "https://example.test/beta.js",
        sha256: "bbb",
        installed: true,
        installedVersion: "stale",
        updateAvailable: true,
      },
    ],
  },
  userScripts: { enabled: true, scripts: [] },
};

const inventory: UserScriptInventory = {
  enabled: false,
  scripts: [
    {
      key: "builtin",
      name: "Built in",
      source: "builtin",
      enabled: true,
      status: "ok",
      error: "",
    },
    {
      key: "alpha-local",
      name: "Alpha local",
      source: "user",
      enabled: false,
      status: "disabled",
      error: "",
      market_id: "alpha",
      version: "1.5.0",
    },
    {
      key: "manual",
      name: "Manual",
      source: "user",
      enabled: true,
      status: "ok",
      error: "",
    },
  ],
};

test("keeps a missing market result missing during adapter reconciliation", () => {
  assert.equal(syncMarketInstalledState(null, inventory), null);
});

test("projects a minimal ordered view with market version and update semantics", () => {
  const view = projectUserScriptsView(inventory, market);

  assert.deepEqual(view.summary, {
    marketScriptCount: 2,
    installedCount: 1,
    localEnabled: false,
    marketMessage: "loaded",
  });
  assert.deepEqual(
    view.market.items.map((item) => ({
      id: item.id,
      installed: item.installed,
      installedVersion: item.installedVersion,
      updateAvailable: item.updateAvailable,
    })),
    [
      { id: "alpha", installed: false, installedVersion: "", updateAvailable: false },
      { id: "beta", installed: true, installedVersion: "stale", updateAvailable: true },
    ],
  );
  assert.deepEqual(
    view.localItems.map(({ key, source, marketVersion, canDelete }) => ({
      key,
      source,
      marketVersion,
      canDelete,
    })),
    [
      { key: "builtin", source: "builtin", marketVersion: "", canDelete: false },
      { key: "alpha-local", source: "market", marketVersion: "1.5.0", canDelete: true },
      { key: "manual", source: "user", marketVersion: "", canDelete: true },
    ],
  );
  assert.deepEqual(view.market.items.map((item) => item.name), ["Alpha", "Beta"]);
  assert.deepEqual(view.localItems.map((item) => item.name), ["Built in", "Alpha local", "Manual"]);
  assert.equal("scriptUrl" in view.market.items[0], false);
  assert.equal("sha256" in view.market.items[0], false);
});

test("projects empty inventory and failed market state without transport wrappers", () => {
  const failed: ScriptMarketResult = {
    ...market,
    status: "failed",
    message: "network down",
    market: { ...market.market, message: "unavailable", updatedAt: "", scripts: [] },
  };

  assert.deepEqual(projectUserScriptsView(undefined, failed), {
    summary: {
      marketScriptCount: 0,
      installedCount: 0,
      localEnabled: true,
      marketMessage: "unavailable",
    },
    market: {
      status: "failed",
      message: "network down",
      updatedAt: "",
      items: [],
    },
    localItems: [],
  });
});

test("keeps the baseline empty local view when settings have not loaded yet", () => {
  const view = projectUserScriptsView(undefined, {
    ...market,
    userScripts: inventory,
  });

  assert.equal(view.summary.localEnabled, true);
  assert.deepEqual(view.localItems, []);
  assert.deepEqual(
    view.market.items.map(({ id, installed, installedVersion }) => ({
      id,
      installed,
      installedVersion,
    })),
    [
      { id: "alpha", installed: false, installedVersion: "" },
      { id: "beta", installed: true, installedVersion: "stale" },
    ],
  );
});

test("keeps market installation fields authoritative when settings inventory is stale", () => {
  const staleInventory: UserScriptInventory = {
    enabled: false,
    scripts: [
      {
        key: "alpha-old",
        name: "Stale Alpha",
        source: "user",
        enabled: false,
        status: "disabled",
        error: "",
        market_id: "alpha",
        version: "0.1.0",
      },
    ],
  };

  const view = projectUserScriptsView(staleInventory, market);

  assert.deepEqual(view.localItems.map((item) => item.key), ["alpha-old"]);
  assert.equal(view.summary.localEnabled, false);
  assert.deepEqual(
    view.market.items.map(({ id, installed, installedVersion, updateAvailable }) => ({
      id,
      installed,
      installedVersion,
      updateAvailable,
    })),
    [
      { id: "alpha", installed: false, installedVersion: "", updateAvailable: false },
      { id: "beta", installed: true, installedVersion: "stale", updateAvailable: true },
    ],
  );
  assert.equal(view.summary.installedCount, 1);
});
