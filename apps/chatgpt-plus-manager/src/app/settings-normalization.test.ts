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
    codexAppImageOverlayOpacity: 500,
    codexAppImageOverlayFitMode: "unsupported" as never,
    codexAppStepwiseMaxItems: -4,
    codexAppStepwiseMaxInputChars: 100,
    codexAppStepwiseMaxOutputTokens: 9000,
    codexAppStepwiseTimeoutMs: 500,
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
  assert.equal(normalized.codexAppImageOverlayOpacity, 100);
  assert.equal(normalized.codexAppImageOverlayFitMode, "fit");
  assert.equal(normalized.codexAppStepwiseMaxItems, 0);
  assert.equal(normalized.codexAppStepwiseMaxInputChars, 1000);
  assert.equal(normalized.codexAppStepwiseMaxOutputTokens, 4000);
  assert.equal(normalized.codexAppStepwiseTimeoutMs, 1000);
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
