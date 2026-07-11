import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeContextSettings,
  parseContextConfig,
  projectRelayFiles,
  promoteRelayCommonConfig,
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
