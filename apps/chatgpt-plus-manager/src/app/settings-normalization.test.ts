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
      "[[skills.config]]",
      'path = "/tmp/review"',
      "",
      'plugins.demo = { enabled = true }',
      "",
    ].join("\n"),
    relayContextConfigContents: '[plugins.demo]\nenabled = true\n',
  });

  assert.equal(normalized.relayProfiles[0]?.id, "legacy");
  assert.equal(normalized.relayProfiles[0]?.baseUrl, "https://legacy.example/v1");
  assert.equal(normalized.relayProfiles[0]?.apiKey, "sk-legacy");
  assert.deepEqual(normalized.relayProfiles[0]?.contextSelection, {
    mcpServers: [],
    skills: [],
    plugins: [],
  });
  assert.equal(normalized.relayCommonConfigContents, 'model = "gpt"\n');
  assert.equal(normalized.relayContextConfigContents, "");
});

test("defaults a legacy Relay profile without native image generation configuration to false", () => {
  const legacy = structuredClone(defaultSettings) as unknown as {
    relayProfiles: Array<Record<string, unknown>>;
  };
  delete legacy.relayProfiles[0]?.nativeImageGenerationEnabled;

  const normalized = normalizeSettings(legacy as unknown as typeof defaultSettings);

  assert.equal(normalized.relayProfiles[0]?.nativeImageGenerationEnabled, false);
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

test("drops native extension tables from stored provider snapshots", () => {
  const profile = {
    ...defaultSettings.relayProfiles[0],
    relayMode: "pureApi" as const,
    configContents: 'model = "gpt-5"\n\n[[skills.config]]\npath = "/tmp/review"\n\n[features]\nskills = true\n',
  };

  const normalized = normalizeSettings({
    ...defaultSettings,
    relayProfiles: [profile],
  });

  assert.equal(
    normalized.relayProfiles[0]?.configContents,
    'model = "gpt-5"\n\n[features]\nskills = true\n',
  );
});
