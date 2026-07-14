import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createManagerActions,
  type InvokeManagerCommand,
  type TauriCommandName,
} from "./actions.ts";

type Invocation = { command: string; args?: Record<string, unknown> };

function recordingActions(result: unknown = { status: "ok", message: "ok" }) {
  const invocations: Invocation[] = [];
  const invoke: InvokeManagerCommand = async <T>(
    command: TauriCommandName,
    args?: Record<string, unknown>,
  ) => {
    invocations.push({ command, args });
    return result as T;
  };
  const actions = createManagerActions(invoke);
  return { actions, invocations };
}

test("publishes domain adapters instead of one flat command bag", () => {
  const { actions } = recordingActions();

  assert.deepEqual(Object.keys(actions).sort(), [
    "app",
    "diagnostics",
    "maintenance",
    "overview",
    "relay",
    "sessions",
    "settings",
  ]);
  assert.equal("invoke" in actions, false);
  assert.equal("call" in actions, false);
});

test("adapters own wire command names and nested payload shapes", async () => {
  const { actions, invocations } = recordingActions();
  const settings = {} as never;
  const profile = { id: "relay-a" } as never;

  await actions.overview.launch({ appPath: "/Applications/Codex.app" });
  await actions.relay.switchProfile({ settings, targetRelayId: "relay-a" });
  await actions.relay.saveFile("config", "model = \"gpt-5\"\n");
  await actions.relay.fetchModels(profile);
  await actions.sessions.delete({ id: "session-a", title: "Hello", dbPath: "/tmp/state.sqlite" });
  await actions.sessions.exportMarkdown({ id: "session-a", title: "Hello", dbPath: "/tmp/state.sqlite" }, "/tmp/hello.md");
  await actions.sessions.loadUsage({ id: "session-a", title: "Hello", dbPath: "/tmp/state.sqlite" });
  await actions.maintenance.mutatePlugin("demo@personal", "disable");
  await actions.maintenance.registerPluginMarketplace("personal", "/tmp/personal-market");
  await actions.maintenance.uninstallEntrypoints(true);
  await actions.app.updateTrayLabels({ showLabel: "Show", quitLabel: "Quit", windowTitle: "Manager" });

  assert.deepEqual(invocations, [
    {
      command: "launch_chatgpt_plus",
      args: { request: { appPath: "/Applications/Codex.app" } },
    },
    {
      command: "switch_relay_profile",
      args: { request: { settings, targetRelayId: "relay-a" } },
    },
    {
      command: "save_relay_file",
      args: { request: { kind: "config", contents: "model = \"gpt-5\"\n" } },
    },
    { command: "fetch_relay_profile_models", args: { profile } },
    {
      command: "delete_local_session",
      args: { request: { sessionId: "session-a", title: "Hello", dbPath: "/tmp/state.sqlite" } },
    },
    {
      command: "export_local_session_markdown",
      args: { request: { sessionId: "session-a", title: "Hello", dbPath: "/tmp/state.sqlite", destinationPath: "/tmp/hello.md" } },
    },
    {
      command: "load_local_session_usage",
      args: { request: { sessionId: "session-a", title: "Hello", dbPath: "/tmp/state.sqlite" } },
    },
    {
      command: "mutate_plugin",
      args: { request: { pluginId: "demo@personal", action: "disable" } },
    },
    {
      command: "register_plugin_marketplace",
      args: { request: { name: "personal", source: "/tmp/personal-market" } },
    },
    { command: "uninstall_entrypoints", args: { options: { removeOwnedData: true } } },
    {
      command: "update_tray_labels",
      args: { showLabel: "Show", quitLabel: "Quit", windowTitle: "Manager" },
    },
  ]);
});

test("adapters honor each command's Rust wire casing before callers observe it", async () => {
  const sessionCommands = readFileSync(
    new URL("../../src-tauri/src/commands/sessions.rs", import.meta.url),
    "utf8",
  );
  assert.match(
    sessionCommands,
    /#\[serde\(rename_all = "camelCase"\)\]\s*pub struct LocalSessionsPayload/,
  );
  const sessionData = readFileSync(
    new URL("../../../../crates/chatgpt-plus-data/src/storage.rs", import.meta.url),
    "utf8",
  );
  assert.match(
    sessionData,
    /#\[serde\(rename_all = "camelCase"\)\]\s*pub struct LocalSession/,
  );

  const actions = createManagerActions(async <T>(command: TauriCommandName) => {
    const resultByCommand: Partial<Record<TauriCommandName, unknown>> = {
      load_overview: {
        status: "ok",
        message: "ok",
        codex_app: { status: "found", path: "/Applications/Codex.app" },
        codex_version: "1.2.3",
        app_shortcut: { status: "installed", path: "/tmp/ChatGPT++.lnk" },
        legacy_management_shortcut: { status: "missing", path: "/tmp/legacy.lnk" },
        latest_launch: {
          status: "running",
          message: "ok",
          started_at_ms: 10,
          protocol_proxy_port: 57321,
          codex_app: "/Applications/Codex.app",
        },
        current_version: "1.2.3",
        update_status: "current",
        settings_path: "/tmp/settings.json",
        logs_path: "/tmp/manager.log",
      },
      load_settings: {
        status: "ok",
        message: "ok",
        settings: {},
        settings_path: "/tmp/settings.json",
      },
      install_entrypoints: {
        status: "ok",
        message: "ok",
        app_shortcut: { installed: true, path: "/tmp/ChatGPT++.lnk" },
        legacy_management_shortcut: { installed: false, path: "/tmp/legacy.lnk" },
      },
      delete_local_session: {
        status: "ok",
        message: "ok",
        session_id: "session-a",
        undo_token: "undo-a",
        backup_path: "/tmp/backup",
      },
      list_local_sessions: {
        status: "ok",
        message: "ok",
        dbPath: "/tmp/state.sqlite",
        dbPaths: ["/tmp/state.sqlite"],
        sessions: [],
      },
      switch_relay_profile: {
        status: "ok",
        message: "ok",
        settings: {},
        settingsPath: "/tmp/settings.json",
        relay: { configured: true },
      },
    };
    return resultByCommand[command] as T;
  });

  const overview = await actions.overview.load();
  const settings = await actions.settings.load();
  const entrypoints = await actions.maintenance.installEntrypoints();
  const deleted = await actions.sessions.delete({ id: "session-a", title: "A", dbPath: "/tmp/db" });
  const sessions = await actions.sessions.list();
  const switched = await actions.relay.switchProfile({
    settings: {} as never,
    targetRelayId: "relay-a",
  });

  assert.deepEqual(overview.latestLaunch, {
    status: "running",
    message: "ok",
    startedAtMs: 10,
    protocolProxyPort: 57321,
    codexApp: "/Applications/Codex.app",
  });
  assert.equal(overview.settingsPath, "/tmp/settings.json");
  assert.deepEqual(overview.appShortcut, {
    status: "installed",
    path: "/tmp/ChatGPT++.lnk",
  });
  assert.equal("legacy_management_shortcut" in overview, false);
  assert.equal("latest_launch" in overview, false);
  assert.equal(settings.settingsPath, "/tmp/settings.json");
  assert.equal("user_scripts" in settings, false);
  assert.deepEqual(entrypoints.appShortcut, {
    installed: true,
    path: "/tmp/ChatGPT++.lnk",
  });
  assert.equal("legacy_management_shortcut" in entrypoints, false);
  assert.deepEqual(deleted, {
    status: "ok",
    message: "ok",
    sessionId: "session-a",
    undoToken: "undo-a",
    backupPath: "/tmp/backup",
  });
  assert.equal(sessions.dbPath, "/tmp/state.sqlite");
  assert.deepEqual(sessions.dbPaths, ["/tmp/state.sqlite"]);
  assert.deepEqual(switched.relay, { configured: true });
});

test("root App depends only on typed manager actions", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  assert.match(app, /import\s*\{[\s\S]*?\bmanagerActions\b[\s\S]*?\}\s*from ["']@\/app\/actions["']/);
  assert.doesNotMatch(app, /@tauri-apps\/api\/core/);
  assert.doesNotMatch(app, /\binvoke\s*\(/);
  assert.doesNotMatch(app, /\bcall(?:<[^>]+>)?\s*\(/);
  assert.doesNotMatch(app, /"(?:load_settings|save_settings|switch_relay_profile|write_diagnostic_event)"/);
});
