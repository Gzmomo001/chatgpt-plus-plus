import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { TAURI_COMMAND_NAMES } from "./actions.ts";
import { ROUTE_IDS } from "./routes.ts";

test("owns application composition under app without a root forwarding wrapper", () => {
  const sourceRoot = new URL("../", import.meta.url);
  const appPath = new URL("./App.tsx", import.meta.url);
  const legacyAppPath = new URL("../App.tsx", import.meta.url);
  const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

  assert.equal(existsSync(appPath), true, "app/App.tsx must own application composition");
  assert.equal(existsSync(legacyAppPath), false, "the root App.tsx forwarding path must be deleted");
  assert.match(main, /import \{ App \} from ["']\.\/app\/App["']/);

  const app = readFileSync(appPath, "utf8");
  assert.match(app, /export function App\(\)/);
  assert.doesNotMatch(
    app,
    /function (?:FeatureItem|GuideList|PendingProviderImportDialog|providerImportWireApiLabel|providerImportRelayModeLabel|maskSecret|truncateSessionDeletePreview|providerSyncProgressMessage|formatDuration|formatBytes)\b/,
    "application composition must not re-own concrete presenters or dead screen helpers",
  );

  const sourceEntries = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" }) as string[];
  for (const entry of sourceEntries) {
    if (!/\.[cm]?[jt]sx?$/.test(entry)) continue;
    const source = readFileSync(new URL(entry, sourceRoot), "utf8");
    assert.doesNotMatch(source, /from ["'](?:\.\.\/)*App["']/, `${entry} must import app/App`);
  }
});

test("publishes the manager routes in navigation order", () => {
  assert.deepEqual(ROUTE_IDS, [
    "overview",
    "relay",
    "sessions",
    "context",
    "enhance",
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
    "import_ccs_providers",
    "install_entrypoints",
    "install_market_script",
    "install_watcher",
    "launch_chatgpt_plus",
    "list_local_sessions",
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

test("owns every shared UI primitive under the shared module", () => {
  const sourceRoot = new URL("../", import.meta.url);
  const sharedUiRoot = new URL("../shared/ui/", import.meta.url);
  const legacyUiRoot = new URL("../components/ui/", import.meta.url);
  const componentGeneratorConfig = JSON.parse(
    readFileSync(new URL("../../components.json", import.meta.url), "utf8"),
  ) as { aliases?: { ui?: string } };
  const publicExports = {
    "badge.tsx": ["Badge", "badgeVariants"],
    "button.tsx": ["Button", "buttonVariants"],
    "card.tsx": ["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent"],
    "input.tsx": ["Input"],
    "label.tsx": ["Label"],
    "textarea.tsx": ["Textarea"],
  } as const;

  assert.equal(componentGeneratorConfig.aliases?.ui, "@/shared/ui");

  for (const [entry, exports] of Object.entries(publicExports)) {
    const modulePath = new URL(entry, sharedUiRoot);
    assert.equal(existsSync(modulePath), true, `${entry} must be owned by shared/ui`);
    const source = readFileSync(modulePath, "utf8");
    const exportList = source.match(/export\s*\{([^}]*)\}/);
    assert.ok(exportList, `${entry} must publish its UI interface`);
    assert.deepEqual(
      [...exportList[1].matchAll(/\b[A-Za-z_$][\w$]*\b/g)]
        .map((match) => match[0])
        .sort(),
      [...exports].sort(),
      `${entry} must preserve its public exports`,
    );
  }

  const button = readFileSync(new URL("button.tsx", sharedUiRoot), "utf8");
  assert.match(button, /React\.forwardRef<HTMLButtonElement, ButtonProps>/);
  assert.match(button, /Button\.displayName = ["']Button["']/);
  assert.match(button, /variant:\s*\{[\s\S]*?default:[\s\S]*?secondary:[\s\S]*?outline:[\s\S]*?ghost:/);
  assert.match(button, /defaultVariants:\s*\{\s*variant:\s*["']default["'],\s*size:\s*["']default["']/);

  const badge = readFileSync(new URL("badge.tsx", sharedUiRoot), "utf8");
  assert.match(badge, /variant:\s*\{[\s\S]*?default:[\s\S]*?secondary:[\s\S]*?outline:/);
  assert.match(badge, /defaultVariants:\s*\{\s*variant:\s*["']secondary["']/);

  for (const entry of ["card.tsx", "input.tsx", "label.tsx", "textarea.tsx"] as const) {
    const source = readFileSync(new URL(entry, sharedUiRoot), "utf8");
    const componentNames = publicExports[entry];
    for (const componentName of componentNames) {
      assert.match(source, new RegExp(`${componentName}\\.displayName = ["']${componentName}["']`));
    }
  }

  assert.equal(existsSync(legacyUiRoot), false, "the legacy components/ui path must be deleted");
  const sourceEntries = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" }) as string[];
  for (const entry of sourceEntries) {
    if (!/\.[cm]?[jt]sx?$/.test(entry)) continue;
    const source = readFileSync(new URL(entry, sourceRoot), "utf8");
    assert.doesNotMatch(source, /@\/components\/ui(?:\/|["'])/, `${entry} must use shared/ui`);
  }
});

test("composes Sessions through its screen-owned vertical slice", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screenPath = new URL(
    "../screens/sessions/SessionsScreen.tsx",
    import.meta.url,
  );

  assert.equal(existsSync(screenPath), true);
  const screen = readFileSync(screenPath, "utf8");
  assert.match(
    app,
    /import \{ SessionsScreen \} from ["']@\/screens\/sessions\/SessionsScreen["']/,
  );
  assert.match(app, /<SessionsScreen\b/);
  assert.doesNotMatch(app, /function SessionsScreen\(/);
  assert.match(screen, /export function SessionsScreen\(/);
  assert.doesNotMatch(screen, /@tauri-apps\/api|\binvoke\s*\(|@\/app(?:\/|["'])/);
  assert.doesNotMatch(screen, /\bSessionsControllerView\b|\bSessionsIntent\b|\bLocalSessionsResult\b|\bProviderSyncTargetOption\b/);
  const actionContract = screen.match(/export type SessionsActions\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(actionContract);
  assert.deepEqual(
    [...actionContract[1].matchAll(/^\s{2}(\w+):/gm)].map((match) => match[1]),
    [
      "refreshSessions",
      "toggleSessionSelection",
      "selectAllSessions",
      "clearSessionSelection",
      "deleteSelectedSessions",
      "deleteSession",
      "syncProvidersNow",
      "selectProviderSyncTarget",
      "setProviderSyncEnabled",
      "saveProviderSyncSettings",
    ],
  );
});

test("composes Relay profiles through its screen-owned vertical slice", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
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
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
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
    "enhancementsEnabled",
  ]) {
    assert.match(appContracts, new RegExp(`\\b${unrelated}\\b`));
    assert.doesNotMatch(relayContracts, new RegExp(`\\b${unrelated}\\b`));
  }
  assert.doesNotMatch(relayController, /\bas Settings\b/);
  assert.doesNotMatch(app, /relaySettings\s+as\s+BackendSettings/);
});

test("composes Overview through its screen-owned vertical slice", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
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
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
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
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
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
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
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

test("composes Enhance through a minimal screen-owned view and action seam", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/enhance/EnhanceScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /import \{ EnhanceScreen \} from ["']@\/screens\/enhance\/EnhanceScreen["']/);
  assert.match(app, /<EnhanceScreen\b/);
  assert.match(app, /<EnhanceScreen\s+view=\{enhanceView\}\s+actions=\{enhanceActions\}/);
  assert.match(screen, /export type EnhanceView\s*=\s*\{/);
  assert.match(screen, /export type EnhanceActions\s*=\s*\{/);
  assert.doesNotMatch(screen, /\bBackendSettings\b|\bActions\b(?!\s*=)|@tauri-apps\/api|\binvoke\s*\(/);
  assert.doesNotMatch(screen, /from ["']@\/app(?:\/|["'])/);

  for (const definition of ["EnhanceScreen", "ModeSelector", "FeatureGroup", "FeatureToggle"]) {
    assert.doesNotMatch(app, new RegExp(`function ${definition}\\(`));
  }

  const typeKeys = (name: string) => {
    const body = screen.match(new RegExp(`export type ${name} = \\{([\\s\\S]*?)\\n\\};`))?.[1] ?? "";
    return [...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
  };
  assert.deepEqual(typeKeys("EnhanceSettingsView"), [
    "enhancementsEnabled",
    "computerUseGuardEnabled",
    "codexAppPluginMarketplaceUnlock",
    "codexAppPluginAutoExpand",
    "codexAppModelWhitelistUnlock",
    "codexAppServiceTierControls",
    "codexAppSessionDelete",
    "codexAppMarkdownExport",
    "codexAppPasteFix",
    "codexAppProjectMove",
    "codexAppThreadIdBadge",
    "codexAppConversationView",
    "codexAppThreadScrollRestore",
    "codexAppStepwiseEnabled",
    "codexAppStepwiseDirectSend",
    "codexAppForceChineseLocale",
    "codexAppFastStartup",
    "codexAppNativeMenuPlacement",
    "codexAppNativeMenuLocalization",
    "codexAppUpstreamWorktreeCreate",
    "launchMode",
  ]);
  assert.deepEqual(typeKeys("RemotePluginMarketplaceView"), [
    "marketplaceRoot",
    "configRegistered",
    "pluginCount",
    "skillCount",
  ]);
  assert.deepEqual(typeKeys("EnhanceView"), [
    "settings",
    "pluginMarketplaceProgress",
    "remotePluginMarketplace",
    "remotePluginMarketplaceProgress",
  ]);
  assert.deepEqual(typeKeys("EnhanceActions"), [
    "updateFlag",
    "setLaunchMode",
    "repairPluginMarketplace",
    "refreshRemotePluginMarketplace",
    "repairRemotePluginMarketplace",
    "saveSettings",
  ]);

  assert.doesNotMatch(screen, /\bzed\b/i);
});

test("composes Recommendations through its screen-owned vertical slice", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
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

test("composes User Scripts through a screen-owned neutral inventory seam", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/user-scripts/UserScriptsScreen.tsx", import.meta.url),
    "utf8",
  );
  const presentation = readFileSync(
    new URL("../features/user-scripts/presentation.ts", import.meta.url),
    "utf8",
  );
  const appContracts = readFileSync(new URL("./contracts.ts", import.meta.url), "utf8");
  const userScriptContracts = readFileSync(
    new URL("../shared/contracts/user-scripts.ts", import.meta.url),
    "utf8",
  );

  assert.match(app, /import \{ UserScriptsScreen \} from ["']@\/screens\/user-scripts\/UserScriptsScreen["']/);
  assert.match(
    app,
    /projectUserScriptsView\(\s*settings\?\.userScripts,\s*scriptMarket,?\s*\)/,
  );
  assert.match(app, /<UserScriptsScreen\b[^>]*\bview=\{userScriptsView\}/s);
  assert.match(screen, /export function UserScriptsScreen\(/);
  const actionContract = screen.match(
    /export type UserScriptsActions\s*=\s*\{([\s\S]*?)\n\};/,
  );
  assert.ok(actionContract);
  assert.deepEqual(
    [...actionContract[1].matchAll(/^\s*(\w+):/gm)].map((match) => match[1]),
    [
      "executeUserScriptsAction",
      "openExternalUrl",
    ],
  );
  assert.doesNotMatch(screen, /@tauri-apps\/api|\binvoke\s*\(|@\/app(?:\/|["'])/);
  assert.doesNotMatch(presentation, /@tauri-apps\/api|\binvoke\s*\(|@\/app(?:\/|["'])/);
  assert.doesNotMatch(screen, /\b(?:market_id|script_url|user_scripts|CommandResult)\b/);

  for (const definition of ["UserScriptsScreen", "MarketScriptCard", "ScriptRow"])
    assert.doesNotMatch(app, new RegExp(`function ${definition}\\(`));
  assert.doesNotMatch(app, /function syncMarketInstalledState\(/);
  assert.doesNotMatch(app, /const SCRIPT_MARKET_REPOSITORY_URL\b/);

  assert.match(userScriptContracts, /export type UserScriptInventory\s*=\s*\{/);
  assert.match(userScriptContracts, /export type ScriptMarketItem\s*=\s*\{/);
  assert.match(userScriptContracts, /export type ScriptMarketResult\s*=/);
  assert.doesNotMatch(appContracts, /(?:export\s+)?type UserScriptInventory\s*=\s*\{/);
  assert.doesNotMatch(app, /(?:export\s+)?type ScriptMarket(?:Item|Result)\s*=/);
  assert.match(appContracts, /export type BackendSettings\s*=\s*\{/);
});

test("composes Maintenance through a minimal screen-owned view and action seam", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/maintenance/MaintenanceScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    app,
    /import \{ MaintenanceScreen \} from ["']@\/screens\/maintenance\/MaintenanceScreen["']/,
  );
  assert.match(app, /<MaintenanceScreen\s+view=\{maintenanceView\}\s+actions=\{maintenanceActions\}/);
  assert.match(screen, /export type MaintenanceView\s*=\s*\{/);
  assert.match(screen, /export type MaintenanceActions\s*=\s*\{/);
  assert.doesNotMatch(
    screen,
    /\b(?:OverviewResult|SettingsResult|BackendSettings|WatcherResult|Actions)\b(?!\s*=)|@tauri-apps\/api|\binvoke\s*\(/,
  );
  assert.doesNotMatch(screen, /from ["']@\/app(?:\/|["'])/);

  for (const definition of ["MaintenanceScreen", "StatusRow"]) {
    assert.doesNotMatch(app, new RegExp(`function ${definition}\\(`));
  }

  const typeKeys = (name: string) => {
    const body = screen.match(new RegExp(`export type ${name} = \\{([\\s\\S]*?)\\n\\};`))?.[1] ?? "";
    return [...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
  };
  assert.deepEqual(typeKeys("MaintenanceView"), [
    "codexApp",
    "appShortcut",
    "watcher",
    "savedCodexAppPath",
    "launchForm",
    "removeOwnedData",
  ]);
  assert.deepEqual(typeKeys("MaintenanceActions"), [
    "updateLaunchForm",
    "setRemoveOwnedData",
    "checkHealth",
    "repairShortcuts",
    "installEntrypoints",
    "uninstallEntrypoints",
    "installWatcher",
    "uninstallWatcher",
    "enableWatcher",
    "disableWatcher",
    "chooseCodexAppPath",
    "clearCodexAppPath",
    "launch",
    "saveManualCodexAppPath",
  ]);
});

test("does not publish the removed remote-project integration", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const contracts = readFileSync(new URL("./contracts.ts", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const translations = readFileSync(new URL("../i18n/english.ts", import.meta.url), "utf8");
  const featureSlug = ["zed", "remote"].join("-");
  const camelName = ["zed", "Remote"].join("");
  const typeName = ["Z", "ed", "Remote"].join("");
  const commandStem = ["zed", "remote"].join("_");
  const productName = ["Z", "ed"].join("");

  assert.equal(
    existsSync(new URL(`../features/${featureSlug}/`, import.meta.url)),
    false,
  );
  assert.equal(
    existsSync(new URL(`../screens/${featureSlug}/`, import.meta.url)),
    false,
  );
  assert.equal(
    existsSync(new URL(`../shared/contracts/${featureSlug}.ts`, import.meta.url)),
    false,
  );

  for (const [name, source] of Object.entries({ app, routes, actions, contracts, styles, translations })) {
    assert.equal(source.includes(camelName), false, `${name} retains ${camelName}`);
    assert.equal(source.includes(typeName), false, `${name} retains ${typeName}`);
    assert.equal(source.includes(featureSlug), false, `${name} retains ${featureSlug}`);
    assert.equal(source.includes(commandStem), false, `${name} retains ${commandStem}`);
    assert.equal(source.includes(productName), false, `${name} retains removed UI copy`);
  }
});
