import assert from "node:assert/strict";
import test from "node:test";

import { projectPluginInventoryState } from "./presentation.ts";

const inventory = (status: string, pluginCount: number) => ({
  status,
  message: status,
  marketplaces: [],
  plugins: Array.from({ length: pluginCount }, (_, index) => ({
    id: `plugin-${index}@market`,
    name: `plugin-${index}`,
    displayName: `Plugin ${index}`,
    description: "",
    marketplace: "market",
    installed: false,
    enabled: false,
    skillCount: 0,
  })),
});

test("projects every plugin inventory UI state", () => {
  assert.equal(projectPluginInventoryState(null, null), "idle");
  assert.equal(projectPluginInventoryState(null, "refresh"), "loading");
  assert.equal(projectPluginInventoryState(inventory("failed", 0), null), "error");
  assert.equal(projectPluginInventoryState(inventory("ok", 0), null), "empty");
  assert.equal(projectPluginInventoryState(inventory("ok", 1), null), "ready");
});
