import assert from "node:assert/strict";
import test from "node:test";

import {
  readContextCatalog,
  normalizeContextSettings,
  parseContextConfig,
  projectRelayFiles,
  promoteRelayCommonConfig,
  removeContextEntryFromSelections,
  setContextEntryEnabled,
} from "./config.ts";

test("parses, normalizes, and toggles context configuration through its scenario interface", () => {
  const parsed = parseContextConfig([
    "[mcp_servers.alpha]",
    "enabled = false",
    'command = "uv"',
    "",
    "[skills.review]",
    'path = "/tmp/review"',
    "",
  ].join("\n"));

  assert.equal(parsed.mcpServers[0]?.id, "alpha");
  assert.equal(parsed.mcpServers[0]?.enabled, false);
  assert.equal(parsed.skills[0]?.summary, 'path = "/tmp/review"');
  assert.equal(setContextEntryEnabled(parsed.mcpServers[0]!.tomlBody, true), 'enabled = true\ncommand = "uv"\n');

  assert.deepEqual(
    normalizeContextSettings(
      'model = "gpt"\n\n[mcp_servers.alpha]\ncommand = "uv"\n',
      '[plugins.demo]\nenabled = true\n',
    ),
    {
      relayCommonConfigContents: 'model = "gpt"\n',
      relayContextConfigContents: '[plugins.demo]\nenabled = true\n\n[mcp_servers.alpha]\ncommand = "uv"\n',
    },
  );
});

test("projects editable relay files and promotes extracted common configuration", () => {
  const contextEntries = parseContextConfig('[mcp_servers.alpha]\ncommand = "uv"\n');
  const profile = {
    configContents: 'model = "gpt"\nmodel_context_window = 100\n',
    authContents: '{"OPENAI_API_KEY":"sk-test"}\n',
    contextWindow: "200",
    autoCompactLimit: "",
    contextSelection: { mcpServers: ["alpha"], skills: [], plugins: [] },
  };
  const settings = {
    relayCommonConfigContents: 'approval_policy = "never"\n',
    relayContextConfigContents: '[mcp_servers.alpha]\ncommand = "uv"\n',
  };

  const projection = projectRelayFiles(profile, settings, contextEntries);
  assert.match(projection.configPreview, /model_context_window = 200/);
  assert.match(projection.configPreview, /approval_policy = "never"/);
  assert.match(projection.configPreview, /\[mcp_servers\.alpha\]/);
  assert.equal(
    projection.profileConfigFromPreview(projection.configPreview),
    'model = "gpt"\nmodel_context_window = 200\n',
  );

  assert.deepEqual(
    promoteRelayCommonConfig(
      settings,
      profile,
      {
        commonConfigContents: 'sandbox_mode = "workspace-write"\n\n[skills.review]\npath = "/tmp/review"\n',
        profileConfigContents: 'model = "gpt"\n',
      },
    ),
    {
      settings: {
        relayCommonConfigContents: 'sandbox_mode = "workspace-write"\n',
        relayContextConfigContents: '[mcp_servers.alpha]\ncommand = "uv"\n\n[skills.review]\npath = "/tmp/review"\n',
      },
      profile: { ...profile, configContents: 'model = "gpt"\n' },
    },
  );
});

test("reads a deduplicated stored and live catalog with live enabled state", () => {
  const settings = {
    relayContextConfigContents: [
      "[mcp_servers.alpha]",
      'command = "stored-first"',
      "",
      "[mcp_servers.alpha]",
      'command = "stored-last"',
      "",
      "[skills.missing]",
      'path = "/stored"',
      "",
    ].join("\n"),
  };
  const live = {
    mcpServers: [
      { id: "alpha", kind: "mcp" as const, title: "Live alpha", summary: "live", tomlBody: 'command = "live"\n', enabled: false },
      { id: "live-only", kind: "mcp" as const, title: "Live only", summary: "unknown", tomlBody: 'command = "unknown"\n', enabled: true },
    ],
    skills: [],
    plugins: [],
  };

  const catalog = readContextCatalog(settings, live);

  assert.deepEqual(catalog.entries.mcpServers.map(({ id, enabled }) => ({ id, enabled })), [
    { id: "alpha", enabled: false },
    { id: "live-only", enabled: true },
  ]);
  assert.match(catalog.entries.mcpServers[0]!.tomlBody, /stored-first/);
  assert.deepEqual(catalog.entries.skills.map(({ id, enabled }) => ({ id, enabled })), [
    { id: "missing", enabled: false },
  ]);
  assert.deepEqual(catalog.entriesFor("mcp").map((entry) => entry.id), ["alpha", "live-only"]);
});

test("selects every stored context entry once by kind", () => {
  const catalog = readContextCatalog({
    relayContextConfigContents: [
      "[mcp_servers.alpha]",
      'command = "uv"',
      "",
      "[mcp_servers.alpha]",
      'command = "uvx"',
      "",
      "[skills.review]",
      'path = "/review"',
      "",
      "[plugins.demo]",
      'path = "/demo"',
      "",
    ].join("\n"),
  });

  assert.deepEqual(catalog.defaultSelection, {
    mcpServers: ["alpha"],
    skills: ["review"],
    plugins: ["demo"],
  });
});

test("removes a deleted context id from every profile and preserves unrelated fields", () => {
  const settings = {
    relayContextConfigContents: "",
    activeRelayId: "one",
    concreteFlag: true,
    relayProfiles: [
      {
        id: "one",
        name: "First",
        contextSelection: { mcpServers: ["keep", "deleted"], skills: ["deleted"], plugins: [] },
        configContents: 'model = "gpt"\n',
      },
      {
        id: "two",
        name: "Second",
        contextSelection: { mcpServers: ["deleted"], skills: [], plugins: ["plugin"] },
        authContents: '{"token":"preserve"}\n',
      },
    ],
  };

  const next = removeContextEntryFromSelections(settings, "mcp", "deleted");

  assert.deepEqual(next, {
    ...settings,
    relayProfiles: [
      { ...settings.relayProfiles[0], contextSelection: { mcpServers: ["keep"], skills: ["deleted"], plugins: [] } },
      { ...settings.relayProfiles[1], contextSelection: { mcpServers: [], skills: [], plugins: ["plugin"] } },
    ],
  });
  assert.notEqual(next, settings);
  assert.notEqual(next.relayProfiles, settings.relayProfiles);
});
