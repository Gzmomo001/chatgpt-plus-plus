import assert from "node:assert/strict";
import test from "node:test";

import {
  activeRelayProfile,
  defaultSettings,
  normalizeSettings,
} from "./settings-normalization.ts";

test("normalizes legacy settings through the application settings interface", () => {
  const normalized = normalizeSettings({
    ...defaultSettings,
    relayProfiles: [],
    activeRelayId: "legacy",
    relayBaseUrl: "https://legacy.example/v1",
    relayApiKey: "sk-legacy",
    relayCommonConfigContents: [
      'model = "gpt"',
      "",
      "[mcp_servers.alpha]",
      'command = "uv"',
      "",
    ].join("\n"),
    relayContextConfigContents: '[plugins.demo]\nenabled = true\n',
  });

  assert.equal(normalized.relayProfiles[0]?.id, "legacy");
  assert.equal(normalized.relayProfiles[0]?.baseUrl, "https://legacy.example/v1");
  assert.equal(normalized.relayProfiles[0]?.apiKey, "sk-legacy");
  assert.deepEqual(normalized.relayProfiles[0]?.contextSelection, {
    mcpServers: ["alpha"],
    skills: [],
    plugins: ["demo"],
  });
  assert.equal(normalized.relayCommonConfigContents, 'model = "gpt"\n');
  assert.match(normalized.relayContextConfigContents, /\[mcp_servers\.alpha\]/);
});

test("selects the active profile and preserves deterministic fallbacks", () => {
  const first = { ...defaultSettings.relayProfiles[0], id: "first" };
  const second = { ...defaultSettings.relayProfiles[0], id: "second" };

  assert.equal(
    activeRelayProfile({
      ...defaultSettings,
      relayProfiles: [first, second],
      activeRelayId: "second",
    }).id,
    "second",
  );
  assert.equal(
    activeRelayProfile({
      ...defaultSettings,
      relayProfiles: [first, second],
      activeRelayId: "missing",
    }).id,
    "first",
  );
  assert.equal(
    activeRelayProfile({
      ...defaultSettings,
      relayProfiles: [],
      activeRelayId: "missing",
    }).id,
    "default",
  );
});
