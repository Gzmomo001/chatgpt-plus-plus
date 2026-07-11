import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { TAURI_COMMAND_NAMES } from "./actions.ts";
import { ROUTE_IDS } from "./routes.ts";

test("publishes the manager routes in navigation order", () => {
  assert.deepEqual(ROUTE_IDS, [
    "overview",
    "relay",
    "sessions",
    "context",
    "enhance",
    "zedRemote",
    "userScripts",
    "recommendations",
    "maintenance",
    "about",
    "settings",
  ]);
});

test("publishes every frontend-known Tauri command name", () => {
  assert.deepEqual(TAURI_COMMAND_NAMES, [
    "apply_pure_api_injection",
    "apply_relay_injection",
    "check_env_conflicts",
    "check_update",
    "clear_relay_injection",
    "confirm_pending_provider_import",
    "copy_diagnostics",
    "delete_context_entry",
    "delete_local_session",
    "delete_user_script",
    "diagnose_relay_profile",
    "disable_watcher",
    "dismiss_pending_provider_import",
    "enable_watcher",
    "extract_relay_common_config",
    "fetch_relay_profile_models",
    "forget_zed_remote_project",
    "import_ccs_providers",
    "install_entrypoints",
    "install_market_script",
    "install_watcher",
    "launch_chatgpt_plus",
    "list_local_sessions",
    "list_zed_remote_projects",
    "load_ads",
    "load_ccs_providers",
    "load_overview",
    "load_pending_provider_import",
    "load_provider_sync_targets",
    "load_settings",
    "load_watcher_state",
    "manager_exit_app",
    "manager_hide_to_tray",
    "open_external_url",
    "open_zed_remote",
    "perform_update",
    "read_latest_logs",
    "read_live_context_entries",
    "read_relay_files",
    "refresh_script_market",
    "relay_status",
    "remote_plugin_marketplace_status",
    "remove_env_conflicts",
    "repair_plugin_marketplace",
    "repair_remote_plugin_marketplace",
    "repair_shortcuts",
    "reset_image_overlay_settings",
    "reset_settings",
    "restart_chatgpt_plus",
    "save_relay_file",
    "save_settings",
    "set_user_script_enabled",
    "startup_options",
    "switch_relay_profile",
    "sync_live_context_entries",
    "sync_providers_now",
    "test_relay_profile",
    "test_stepwise_settings",
    "uninstall_entrypoints",
    "uninstall_watcher",
    "update_tray_labels",
    "upsert_context_entry",
    "write_diagnostic_event",
  ]);
});

test("composes Relay profiles through its screen-owned vertical slice", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/relay-profiles/RelayProfilesScreen.tsx", import.meta.url),
    "utf8",
  );
  const relayContracts = readFileSync(
    new URL("../features/relay-profiles/contracts.ts", import.meta.url),
    "utf8",
  );

  assert.match(app, /import \{ RelayProfilesScreen \} from ["']@\/screens\/relay-profiles\/RelayProfilesScreen["']/);
  assert.match(app, /<RelayProfilesScreen\b/);
  assert.match(screen, /export function RelayProfilesScreen(?:<[^>]+>)?\(/);
  assert.doesNotMatch(screen, /@tauri-apps\/api|\binvoke\s*\(|@\/app(?:\/|["'])/);
  assert.equal(
    existsSync(new URL("../features/relay-profiles/RelayProfilesScreen.tsx", import.meta.url)),
    false,
  );

  const relayFeatureRoot = new URL("../features/relay-profiles/", import.meta.url);
  const relayFeatureEntries = readdirSync(relayFeatureRoot, {
    recursive: true,
    encoding: "utf8",
  }) as string[];
  for (const entry of relayFeatureEntries) {
    if (!/\.[cm]?[jt]sx?$/.test(entry)) continue;
    const source = readFileSync(new URL(entry, relayFeatureRoot), "utf8");
    assert.doesNotMatch(source, /from ["']@\/screens(?:\/|["'])/, `${entry} must not import a screen`);
  }

  for (const definition of [
    "RelayScreen",
    "RelayProfileList",
    "SortableRelayProfileCard",
    "RelayProfileDetail",
    "RelayProfileEditor",
    "AggregateRelayProfileEditor",
    "EnvConflictNotice",
    "ProviderDoctorModal",
    "providerDoctorSteps",
    "ensureTrailingNewline",
    "selectedContextConfigToml",
    "contextEntryToTomlSection",
    "applyContextLimitPreview",
    "normalizeDuplicateTomlTables",
    "tomlRootKeyFromLine",
    "tomlKey",
    "relayProfileReadinessText",
    "relayProfileModeSwitchedText",
    "aggregateStrategyLabel",
  ]) {
    assert.doesNotMatch(app, new RegExp(`function ${definition}\\(`));
  }
  assert.doesNotMatch(app, /const aggregateStrategyOptions\b/);
  assert.doesNotMatch(app, /@dnd-kit\//);
  assert.doesNotMatch(app, /features\/relay-profiles\/editor/);
  assert.doesNotMatch(app, /ProviderPresetSelector/);

  assert.doesNotMatch(screen, /export type RelayProfileActions/);
  assert.match(
    relayContracts,
    /export type RelayProfileFilesActions(?:<[^>]+>)?\s*=\s*Pick</,
  );

  assert.match(
    app,
    /\[[^\]]*\bccsProviders\s*,\s*relaySwitching\s*\]\s*,?\s*\n\s*\);/,
    "the Relay action capability must refresh when relaySwitching changes",
  );
  assert.doesNotMatch(
    screen,
    /\}, \[actions, detailProfileId, form\.activeRelayId, newProfileDraft\]\);/,
    "Relay file refresh must not feed relayFiles back through the actions object",
  );
});

test("keeps app-wide settings ownership outside the Relay feature", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const appContracts = readFileSync(new URL("./contracts.ts", import.meta.url), "utf8");
  const relayContracts = readFileSync(
    new URL("../features/relay-profiles/contracts.ts", import.meta.url),
    "utf8",
  );
  const relayController = readFileSync(
    new URL("../features/relay-profiles/controller.ts", import.meta.url),
    "utf8",
  );

  assert.match(appContracts, /export type BackendSettings\s*=\s*\{/);
  for (const unrelated of [
    "codexAppStepwiseEnabled",
    "codexAppImageOverlayEnabled",
    "codexAppZedRemoteOpen",
    "enhancementsEnabled",
  ]) {
    assert.match(appContracts, new RegExp(`\\b${unrelated}\\b`));
    assert.doesNotMatch(relayContracts, new RegExp(`\\b${unrelated}\\b`));
  }
  assert.doesNotMatch(relayController, /\bas Settings\b/);
  assert.doesNotMatch(app, /relaySettings\s+as\s+BackendSettings/);
});

test("composes Overview through its screen-owned vertical slice", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/overview/OverviewScreen.tsx", import.meta.url),
    "utf8",
  );
  const relayEditor = readFileSync(
    new URL("../features/relay-profiles/components/RelayProfileEditor.tsx", import.meta.url),
    "utf8",
  );
  const relayDetail = readFileSync(
    new URL("../features/relay-profiles/components/RelayProfileDetail.tsx", import.meta.url),
    "utf8",
  );
  const overviewPresentation = readFileSync(
    new URL("../screens/overview/presentation.ts", import.meta.url),
    "utf8",
  );
  const appContracts = readFileSync(new URL("./contracts.ts", import.meta.url), "utf8");
  const relayContracts = readFileSync(
    new URL("../features/relay-profiles/contracts.ts", import.meta.url),
    "utf8",
  );

  assert.match(app, /import \{ OverviewScreen \} from ["']@\/screens\/overview\/OverviewScreen["']/);
  assert.match(app, /<OverviewScreen\b/);
  assert.match(screen, /export function OverviewScreen(?:<[^>]+>)?\(/);
  assert.doesNotMatch(screen, /@tauri-apps\/api|\binvoke\s*\(/);

  for (const definition of ["OverviewScreen", "LatestLaunch", "healthItems"]) {
    assert.doesNotMatch(app, new RegExp(`function ${definition}\\(`));
  }
  assert.doesNotMatch(
    app,
    /prev\s*===\s*["']running["'][\s\S]{0,240}["'](?:stopped|failed|crashed)["']/,
    "launch crash transition decisions belong to the Overview controller",
  );

  assert.match(relayEditor, /import \{ Metric \} from ["']@\/shared\/ui\/metric["']/);
  assert.doesNotMatch(relayEditor, /function Metric\(/);
  assert.match(relayDetail, /import \{ Toolbar \} from ["']@\/shared\/ui\/layout["']/);
  assert.doesNotMatch(relayDetail, /function Toolbar\(/);

  assert.match(app, /import type \{ OverviewResult \} from ["']@\/shared\/contracts\/overview["']/);
  assert.match(appContracts, /from ["']@\/shared\/contracts\/command["']/);
  assert.match(relayContracts, /from ["']@\/shared\/contracts\/command["']/);
  assert.doesNotMatch(overviewPresentation, /export type (?:OverviewResult|PathState|LaunchStatus)\b/);

  const screensRoot = new URL("../screens/", import.meta.url);
  const screenEntries = readdirSync(screensRoot, { recursive: true, encoding: "utf8" }) as string[];
  for (const entry of screenEntries) {
    if (!/\.[cm]?[jt]sx?$/.test(entry)) continue;
    const source = readFileSync(new URL(entry, screensRoot), "utf8");
    assert.doesNotMatch(source, /from ["']@\/app(?:\/|["'])/, `${entry} must not import from app`);
  }
});

test("composes Context through its screen-owned vertical slice", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/context/ContextScreen.tsx", import.meta.url),
    "utf8",
  );
  const field = readFileSync(new URL("../shared/ui/field.tsx", import.meta.url), "utf8");
  const relayEditor = readFileSync(
    new URL("../features/relay-profiles/components/RelayProfileEditor.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /import \{ ContextScreen \} from ["']@\/screens\/context\/ContextScreen["']/);
  assert.match(app, /<ContextScreen\b/);
  assert.match(screen, /export function ContextScreen(?:<[^>]+>)?\(/);
  assert.match(screen, /export type ContextActions(?:<[^>]+>)?\s*=\s*\{/);
  assert.doesNotMatch(screen, /@tauri-apps\/api|\binvoke\s*\(|@\/app\/App/);
  assert.doesNotMatch(screen, /@\/features\/relay-profiles/);
  assert.match(screen, /applyContextChange/);
  for (const lowLevelOperation of [
    "upsertContextEntry",
    "deleteContextEntry",
    "syncLiveContextEntries",
    "refreshRelayFiles",
    "isSuccessfulContextSync",
  ]) {
    assert.doesNotMatch(screen, new RegExp(`\\b${lowLevelOperation}\\b`));
  }
  assert.match(screen, /import \{ Field \} from ["']@\/shared\/ui\/field["']/);
  assert.match(relayEditor, /import \{ Field \} from ["']@\/shared\/ui\/field["']/);
  assert.match(field, /export function Field\(/);
  assert.doesNotMatch(app, /function Field\(/);
  assert.doesNotMatch(relayEditor, /function Field\(/);

  const contextPorts = app.slice(
    app.indexOf("contextMutationPortsRef.current = {"),
    app.indexOf("const contextMutationControllerRef"),
  );
  assert.match(contextPorts, /commitPersisted:/);
  assert.match(contextPorts, /commitLive:/);
  assert.match(contextPorts, /syncLive:\s*requestContextLiveSync/);
  assert.doesNotMatch(contextPorts, /refreshRelayFiles\(true\)/);
  const persistRequest = contextPorts.slice(
    contextPorts.indexOf("persist:"),
    contextPorts.indexOf("commitPersisted:"),
  );
  const liveRequest = contextPorts.slice(
    contextPorts.indexOf("syncLive:"),
    contextPorts.indexOf("commitLive:"),
  );
  assert.doesNotMatch(persistRequest, /setSettings\(/);
  assert.doesNotMatch(liveRequest, /setLiveContextEntries\(/);

  for (const definition of [
    "ContextScreen",
    "RelayContextManager",
    "ContextEntryEditor",
    "contextEntriesFromSettings",
    "contextEntriesWithLiveEntries",
    "mergeLiveContextEntries",
    "withLiveEntryState",
    "mergeContextEntries",
    "mergeContextEntryList",
    "dedupeContextEntryList",
    "contextEntriesByKind",
    "contextSelectionIds",
    "setContextSelectionId",
    "removeContextSelectionFromSettings",
    "contextSelectionForAllEntries",
  ]) {
    assert.doesNotMatch(app, new RegExp(`function ${definition}\\(`));
  }
});

test("composes diagnostics through its screen-owned vertical slice", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/diagnostics/AboutScreen.tsx", import.meta.url),
    "utf8",
  );
  const diagnosticsContracts = readFileSync(
    new URL("../shared/contracts/diagnostics.ts", import.meta.url),
    "utf8",
  );

  assert.match(app, /import \{ AboutScreen \} from ["']@\/screens\/diagnostics\/AboutScreen["']/);
  assert.match(app, /<AboutScreen\b/);
  assert.match(screen, /export function AboutScreen(?:<[^>]+>)?\(/);
  assert.match(screen, /export type DiagnosticsActions(?:<[^>]+>)?\s*=\s*\{/);
  assert.doesNotMatch(screen, /@tauri-apps\/api|\binvoke\s*\(|@\/app(?:\/|["'])/);

  for (const definition of ["AboutScreen", "LogsPanel", "DiagnosticsPanel", "splitLogLines"]) {
    assert.doesNotMatch(app, new RegExp(`function ${definition}\\(`));
  }
  assert.match(
    diagnosticsContracts,
    /export type (?:LogsResult|DiagnosticsResult|UpdateResult)\s*=\s*CommandResult</,
  );
  assert.doesNotMatch(app, /type (?:LogsResult|DiagnosticsResult|UpdateResult)\s*=/);
});

test("composes Settings through its screen-owned vertical slice", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/settings/SettingsScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /import \{ SettingsScreen \} from ["']@\/screens\/settings\/SettingsScreen["']/);
  assert.match(app, /<SettingsScreen\b/);
  assert.match(screen, /export function SettingsScreen(?:<[^>]+>)?\(/);
  assert.match(screen, /export type SettingsActions(?:<[^>]+>)?\s*=\s*\{/);
  assert.match(screen, /export type SettingsForm\s*=\s*\{/);
  assert.doesNotMatch(screen, /@tauri-apps\/api|\binvoke\s*\(|@\/app(?:\/|["'])/);
  assert.doesNotMatch(
    app,
    /from ["']@\/screens\/settings\/(?:presentation|[^"']*\/[^"']+)["']/,
    "App may compose SettingsScreen but must not depend on Settings implementation modules",
  );

  for (const definition of [
    "SettingsScreen",
    "clampNumber",
    "normalizeImageOverlayFitMode",
    "codexExtraArgsToInput",
    "inputToCodexExtraArgs",
  ]) {
    assert.doesNotMatch(app, new RegExp(`function ${definition}\\(`));
  }
});

test("composes Recommendations through its screen-owned vertical slice", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const screenPath = new URL(
    "../screens/recommendations/RecommendationsScreen.tsx",
    import.meta.url,
  );

  assert.equal(existsSync(screenPath), true);
  const screen = readFileSync(screenPath, "utf8");
  const recommendationsContracts = readFileSync(
    new URL("../shared/contracts/recommendations.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    app,
    /import \{ RecommendationsScreen \} from ["']@\/screens\/recommendations\/RecommendationsScreen["']/,
  );
  assert.match(app, /<RecommendationsScreen\b/);
  assert.match(screen, /export function RecommendationsScreen(?:<[^>]+>)?\(/);
  const actionContract = screen.match(
    /export type RecommendationsActions\s*=\s*\{([\s\S]*?)\n\};/,
  );
  assert.ok(actionContract);
  assert.deepEqual(
    [...actionContract[1].matchAll(/^\s*(\w+):/gm)].map((match) => match[1]),
    ["refreshAds", "openExternalUrl"],
  );
  assert.match(screen, /refreshAds:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(screen, /openExternalUrl:\s*\(url:\s*string\)\s*=>\s*Promise<void>/);
  assert.doesNotMatch(screen, /@tauri-apps\/api|\binvoke\s*\(|@\/app(?:\/|["'])/);

  for (const definition of ["RecommendationsScreen", "AdGrid", "isExpiredAd"]) {
    assert.doesNotMatch(app, new RegExp(`function ${definition}\\(`));
  }
  assert.doesNotMatch(app, /type (?:AdItem|AdsResult)\s*=/);
  assert.match(
    recommendationsContracts,
    /export type AdsResult\s*=\s*CommandResult</,
  );
  assert.match(
    recommendationsContracts,
    /import type \{ CommandResult \} from ["']\.\/command["']/,
  );
});
