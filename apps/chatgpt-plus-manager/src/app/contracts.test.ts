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
  const brandMarkPath = new URL("./components/BrandMark.tsx", import.meta.url);

  assert.equal(existsSync(appPath), true, "app/App.tsx must own application composition");
  assert.equal(existsSync(legacyAppPath), false, "the root App.tsx forwarding path must be deleted");
  assert.match(main, /import \{ App \} from ["']\.\/app\/App["']/);

  const app = readFileSync(appPath, "utf8");
  assert.match(app, /export function App\(\)/);
  assert.equal(existsSync(brandMarkPath), false);
  assert.doesNotMatch(app, /BrandMark|brand-mark/);
  assert.match(app, /className=["']brand-title["']>[\s\S]*?ChatGPT\+\+/);
  assert.match(app, /DEVELOPMENT_RUNTIME[\s\S]*?development-badge/);
  assert.match(app, /className=["']topbar-navigation["'][\s\S]*?<nav[^>]+className=["']nav["']/);
  assert.doesNotMatch(app, /className=["']page-heading["']/);
  assert.doesNotMatch(app, /className=["']nav-label["']|className=["']nav-badge["']/);
  assert.doesNotMatch(
    app,
    /<aside\b|sidebarCollapsed|sidebarWidth|sidebar-resize-handle|PanelLeft(?:Open|Close)/,
  );
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

test("leaves east-edge resizing to the native resizable window", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const capability = readFileSync(
    new URL("../../src-tauri/capabilities/default.json", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(app, /window-resize-east-handle|startResizeDragging/);
  assert.doesNotMatch(styles, /\.window-resize-east-handle\b/);
  assert.doesNotMatch(capability, /core:window:allow-start-resize-dragging/);
});

test("keeps relay profile cards stationary on hover", () => {
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.match(
    styles,
    /\.relay-list-content \.relay-profile-card:hover,[\s\S]*?transform:\s*none;/,
  );
});

test("publishes the manager routes in navigation order", () => {
  assert.deepEqual(ROUTE_IDS, [
    "relay",
    "sessions",
    "enhance",
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
    "delete_local_session",
    "diagnose_relay_profile",
    "dismiss_pending_provider_import",
    "export_local_session_markdown",
    "extract_relay_common_config",
    "fetch_relay_profile_models",
    "import_ccs_providers",
    "install_entrypoints",
    "launch_chatgpt_plus",
    "list_local_sessions",
    "load_ads",
    "load_ccs_providers",
    "load_overview",
    "load_pending_provider_import",
    "load_provider_sync_targets",
    "load_settings",
    "manager_exit_app",
    "manager_hide_to_tray",
    "mutate_plugin",
    "open_external_url",
    "perform_update",
    "plugin_marketplace_inventory",
    "open_log_folder",
    "read_relay_files",
    "refresh_plugin_marketplace",
    "refresh_remote_plugin_marketplace",
    "register_plugin_marketplace",
    "relay_status",
    "remote_plugin_marketplace_status",
    "remove_env_conflicts",
    "repair_plugin_marketplace",
    "repair_remote_plugin_marketplace",
    "repair_shortcuts",
    "reset_settings",
    "restart_chatgpt_plus",
    "save_preference_settings",
    "save_relay_file",
    "save_settings",
    "startup_options",
    "switch_relay_profile",
    "sync_providers_now",
    "test_relay_profile",
    "uninstall_entrypoints",
    "update_tray_labels",
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
  assert.doesNotMatch(screen, /\bSessionsControllerView\b|\bSessionsIntent\b|\bLocalSessionsResult\b|\bProviderSyncTargetOption\b|同步目标|selectProviderSyncTarget/);
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
      "exportSession",
      "syncProvidersNow",
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

test("keeps retained app-wide settings outside the Relay feature", () => {
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
  for (const unrelated of ["computerUseGuardEnabled", "codexAppFastStartup"]) {
    assert.match(appContracts, new RegExp(`\\b${unrelated}\\b`));
    assert.doesNotMatch(relayContracts, new RegExp(`\\b${unrelated}\\b`));
  }
  for (const removed of ["codexAppStepwiseEnabled", "codexAppImageOverlayEnabled", "enhancementsEnabled"]) {
    assert.doesNotMatch(appContracts, new RegExp(`\\b${removed}\\b`));
  }
  assert.doesNotMatch(relayController, /\bas Settings\b/);
  assert.doesNotMatch(app, /relaySettings\s+as\s+BackendSettings/);
});

test("keeps Overview health projection in the topbar without an Overview page", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const indicators = readFileSync(
    new URL("../screens/overview/OverviewHealthIndicators.tsx", import.meta.url),
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

  assert.match(app, /<OverviewHealthIndicators\s+overview=\{overview\}\s+onRefresh=\{actions\.checkHealth\}/);
  assert.match(indicators, /export function OverviewHealthIndicators(?:<[^>]+>)?\(/);
  assert.doesNotMatch(app, /OverviewScreen|route === ["']overview["']/);
  assert.doesNotMatch(indicators, /最近启动|LatestLaunch|<Panel\b|<CardHead\b/);
  assert.doesNotMatch(indicators, /BadgeCheck|codex-version/);
  assert.match(indicators, /find\(\(item\) => item\.id === ["']codex-app["']\)/);
  assert.doesNotMatch(indicators, /@tauri-apps\/api|\binvoke\s*\(/);
  assert.doesNotMatch(indicators, /JOJO Code|jojocode\.com|官方中转站|jojocode-overview/);
  assert.doesNotMatch(indicators, /ChatGPT\+\+ 应用入口|repairShortcuts/);

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
  assert.match(relayDetail, /import \{ SettingsCard, SettingsCardStack \} from ["']@\/shared\/ui\/layout["']/);
  assert.match(relayDetail, /<SettingsCardStack className="relay-detail-stack">/);
  assert.doesNotMatch(relayDetail, /relay-detail-sticky|返回列表/);

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

  assert.doesNotMatch(app, /function AboutScreen\(/);
  assert.match(
    diagnosticsContracts,
    /export type (?:DiagnosticsResult|UpdateResult)\s*=\s*CommandResult</,
  );
  assert.doesNotMatch(app, /type (?:DiagnosticsResult|UpdateResult)\s*=/);
  assert.doesNotMatch(screen, /LogsPanel|splitLogLines|最近日志/);
});

test("copies a fresh diagnostic report beside the independent GitHub issue action", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/diagnostics/AboutScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(screen, /DiagnosticsPanel|diagnostics\?\.report|log-view tall/);
  assert.doesNotMatch(screen, /refreshDiagnostics|diagnostics:\s*DiagnosticsResult/);
  assert.match(screen, /className=["']about-action-list["']/);

  const copyButton = screen.indexOf('{t("复制诊断报告")}');
  const issueButton = screen.indexOf('{t("反馈问题")}');
  assert.ok(copyButton >= 0, "copy diagnostic report button must be rendered");
  assert.ok(issueButton > copyButton, "copy diagnostic report must appear before report issue");
  assert.match(
    screen,
    /actions\.openExternalUrl\(["']https:\/\/github\.com\/Gzmomo001\/chatgpt-plus-plus\/issues["']\)/,
    "the issue action remains independently clickable",
  );
  assert.match(
    screen,
    /actions\.openExternalUrl\(["']https:\/\/github\.com\/Gzmomo001\/chatgpt-plus-plus["']\)/,
    "the GitHub project action remains independently clickable",
  );

  assert.match(app, /copyLatestDiagnosticReport\s*\(\s*\{/);
  assert.match(app, /generate:\s*\(\)\s*=>\s*managerActions\.diagnostics\.copy\(\)/);
  assert.match(app, /writeClipboard:\s*writeTextToClipboard/);
  assert.doesNotMatch(app, /navigator\.clipboard\.writeText/);
  assert.match(app, /诊断报告已复制，现在可以前往反馈问题并粘贴到 Issue。/);
  assert.match(app, /生成诊断报告失败：\{0\}/);
  assert.match(app, /复制诊断报告失败：\{0\}/);
  assert.doesNotMatch(app, /useState<DiagnosticsResult|setDiagnostics|refreshDiagnostics/);
  assert.doesNotMatch(app, /diagnostics=\{diagnostics\}/);
});

test("publishes one compact About surface instead of the previous Settings stack", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/diagnostics/AboutScreen.tsx", import.meta.url),
    "utf8",
  );
  const presentation = readFileSync(new URL("./presentation.ts", import.meta.url), "utf8");

  assert.match(
    app,
    /<div className=["']settings-page["']>[\s\S]*?<section[^>]+id=["']settings-about["'][\s\S]*?<AboutScreen\b[\s\S]*?<\/div>/,
    "the former Settings route must render only About",
  );
  assert.doesNotMatch(
    app,
    /import \{ (?:SettingsScreen|MaintenanceScreen) \}|<(?:SettingsScreen|MaintenanceScreen)\b/,
  );
  assert.match(presentation, /settings:\s*\{[\s\S]*?label:\s*["']关于["'][\s\S]*?icon:\s*Info/);
  assert.match(screen, /<SettingsCard[\s\S]*?title=\{t\(["']关于["']\)\}/);
  assert.match(screen, /className=["']about-identity["']/);
  assert.match(screen, /className=["']about-action-list["']/);
  assert.doesNotMatch(screen, /@tauri-apps\/api|\binvoke\s*\(|@\/app(?:\/|["'])/);
});

test("uses one dynamic update action and advertises available updates in navigation", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/diagnostics/AboutScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    screen,
    /onClick=\{\(\) => void \(hasUpdate \? actions\.performUpdate\(\) : actions\.checkUpdate\(\)\)\}/,
  );
  assert.match(screen, /hasUpdate[\s\S]*?tf\(["']更新到 \{0\}["']/);
  assert.doesNotMatch(screen, /下载并运行安装包|GitHub Release 更新|releaseSummary|assetName/);
  assert.match(app, /const WEEKLY_UPDATE_CHECK_INTERVAL_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(app, /const AUTOMATIC_UPDATE_CHECKS_ENABLED = import\.meta\.env\.PROD/);
  assert.match(
    app,
    /if \(startup\?\.showUpdate\)[\s\S]*?if \(AUTOMATIC_UPDATE_CHECKS_ENABLED\)[\s\S]*?checkUpdate\(false\)[\s\S]*?else if \(AUTOMATIC_UPDATE_CHECKS_ENABLED\)[\s\S]*?checkUpdate\(true\)/,
  );
  assert.match(
    app,
    /useEffect\(\(\) => \{[\s\S]*?if \(!AUTOMATIC_UPDATE_CHECKS_ENABLED\) return;[\s\S]*?setInterval\(\(\) => \{[\s\S]*?checkUpdate\(true\)[\s\S]*?WEEKLY_UPDATE_CHECK_INTERVAL_MS/,
  );
  assert.match(app, /setInterval\(\(\) => \{[\s\S]*?checkUpdate\(true\)[\s\S]*?WEEKLY_UPDATE_CHECK_INTERVAL_MS/);
  assert.match(app, /className=["']nav-item update-nav-item["']/);
  assert.match(app, /className=["']nav-item update-nav-item["'][\s\S]*?onClick=\{\(\) => void actions\.performUpdate\(\)\}/);
  assert.match(app, /className=["']nav-item update-nav-item["'][\s\S]*?disabled=\{updateInstallProgress\.active\}/);
  assert.doesNotMatch(app, /className=["']nav-item update-nav-item["'][\s\S]*?openSettingsPage\(["']settings-about["']\)/);
  assert.match(app, /hasUpdate \? \([\s\S]*?CircleArrowUp/);
});

test("keeps ChatGPT extra launch arguments behind a collapsed advanced disclosure", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/diagnostics/AboutScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(screen, /<details className=["']about-advanced["']>/);
  assert.doesNotMatch(screen, /<details[^>]+\bopen=/);
  assert.match(screen, /<summary className=["']about-advanced-summary["']>/);
  assert.match(screen, /t\(["']高级功能["']\)/);
  assert.match(screen, /t\(["']ChatGPT 额外启动参数["']\)/);
  assert.match(screen, /value=\{codexExtraArgsToInput\(codexExtraArgs\)\}/);
  assert.match(
    screen,
    /actions\.setCodexExtraArgs\(inputToCodexExtraArgs\(event\.currentTarget\.value\)\)/,
  );
  assert.match(app, /codexExtraArgs=\{settingsForm\.codexExtraArgs\}/);
  assert.match(
    app,
    /setCodexExtraArgs:\s*\(codexExtraArgs[^]*?settingsAutosaveRef\.current\?\.schedule\(\{[^]*?mode:\s*["']autosave["']/,
  );
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
  assert.match(screen, /const isWindows\s*=\s*typeof navigator !== ["']undefined["'][\s\S]*?includes\(["']windows["']\)/);
  assert.match(screen, /isWindows \? \([\s\S]*?Windows Computer Use Guard/);

  for (const definition of ["EnhanceScreen", "FeatureGroup", "FeatureToggle"]) {
    assert.doesNotMatch(app, new RegExp(`function ${definition}\\(`));
  }

  const typeKeys = (name: string) => {
    const body = screen.match(new RegExp(`export type ${name} = \\{([\\s\\S]*?)\\n\\};`))?.[1] ?? "";
    return [...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
  };
  assert.deepEqual(typeKeys("EnhanceSettingsView"), [
    "computerUseGuardEnabled",
    "codexAppFastStartup",
  ]);
  assert.deepEqual(typeKeys("RemotePluginMarketplaceView"), [
    "marketplaceRoot",
    "configRegistered",
    "pluginCount",
    "skillCount",
  ]);
  assert.deepEqual(typeKeys("EnhanceView"), [
    "settings",
    "pluginMarketplacePending",
    "remotePluginMarketplace",
    "remotePluginMarketplacePending",
    "pluginInventory",
    "pluginInventoryPending",
  ]);
  assert.deepEqual(typeKeys("EnhanceActions"), [
    "updateFlag",
    "repairPluginMarketplace",
    "refreshRemotePluginMarketplaceStatus",
    "repairRemotePluginMarketplace",
    "refreshPluginInventory",
    "mutatePlugin",
    "registerPluginMarketplace",
    "upgradePluginMarketplace",
    "upgradeRemotePluginMarketplace",
  ]);

  assert.match(
    app,
    /updateFlag: \(key, value\) => \{[^]*?settingsAutosaveRef\.current\?\.saveNow\(\{[^]*?mode:\s*"manual"[^]*?settings:\s*next/,
    "launch enhancement toggles must persist immediately",
  );
  assert.doesNotMatch(screen, /saveSettings|保存增强设置/);

  assert.doesNotMatch(screen, /\bzed\b/i);
});

test("reuses the About card geometry across settings surfaces", () => {
  const layout = readFileSync(new URL("../shared/ui/layout.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.match(layout, /export function SettingsCard\(/);
  assert.match(layout, /className=\{cn\(["']settings-card["']/);
  assert.match(styles, /--settings-card-max-width:\s*880px/);
  assert.match(styles, /--settings-card-radius:\s*18px/);
  assert.match(styles, /\.screen > \.settings-card-stack\s*\{[\s\S]*?margin-inline:\s*auto/);
  assert.match(layout, /export function SettingsSurface\(/);
  assert.match(styles, /\.settings-surface[\s\S]*?border-radius:\s*var\(--settings-card-radius\)/);
  assert.match(styles, /\.settings-surface > \.panel-head,[\s\S]*?padding:\s*0 2px 9px/);
  assert.match(styles, /\.settings-surface > \[data-slot="card-content"\],[\s\S]*?border:\s*1px solid hsl\(var\(--border\)\)/);
  assert.match(styles, /\.screen\[data-page-shell\] > \*\s*\{[\s\S]*?var\(--page-shell-max-width\)/);
  assert.match(styles, /\.screen\[data-page-shell="settings"\]/);

  for (const path of [
    "../screens/diagnostics/AboutScreen.tsx",
    "../screens/enhance/EnhanceScreen.tsx",
    "../screens/settings/SettingsScreen.tsx",
    "../screens/maintenance/MaintenanceScreen.tsx",
    "../screens/relay-profiles/RelayProfilesScreen.tsx",
    "../screens/sessions/SessionsScreen.tsx",
  ]) {
    const screen = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(screen, /<SettingsCard\b/, `${path} must use the shared settings card`);
  }

  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.match(app, /<section className=["']screen["'] data-page-shell=\{route\}/);
  const sessions = readFileSync(new URL("../screens/sessions/SessionsScreen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(sessions, /<Panel>/, "sessions must not own a separate panel shell");
  assert.doesNotMatch(sessions, /<CardContent>/, "sessions must not nest a second content shell");
  const relay = readFileSync(new URL("../screens/relay-profiles/RelayProfilesScreen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(relay, /<Card className=["']panel relay-list-panel["']/,
    "relay profiles must not own a separate card shell");
});

test("does not expose the removed Recommendations section", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screenPath = new URL(
    "../screens/recommendations/RecommendationsScreen.tsx",
    import.meta.url,
  );

  assert.equal(existsSync(screenPath), false);
  assert.doesNotMatch(app, /RecommendationsScreen|recommendationsActions|refreshAds/);
});

test("removes the Renderer user-script surface end to end", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const appContracts = readFileSync(new URL("./contracts.ts", import.meta.url), "utf8");
  assert.doesNotMatch(app, /UserScripts|userScripts|user-scripts/);
  assert.doesNotMatch(appContracts, /UserScript|userScripts|user-scripts/);
});

test("keeps shortcut maintenance out of the single About route", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /MaintenanceScreen|maintenanceActions/);
  assert.match(app, /<section className=["']settings-page-section["'] id=["']settings-about["']>/);
});

test("keeps the retired SettingsScreen out of the single About route", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /SettingsScreen|settings-preferences|onFormChange=\{\(form\)/);
  assert.match(app, /<AboutScreen[\s\S]*?overview=\{overview\}[\s\S]*?update=\{update\}/);
});

test("exposes the auto-detected ChatGPT path and manual picker on About", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/diagnostics/AboutScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    app,
    /chatGptAppPath=\{overview\?\.codexApp\.path \?\? settingsForm\.codexAppPath\}/,
    "About should display the resolved path while retaining the saved-path loading fallback",
  );
  assert.match(screen, /chatGptAppPath:\s*string/);
  assert.match(screen, /t\(["']ChatGPT 路径["']\)/);
  assert.match(screen, /chatGptAppPath \|\| t\(["']未检测到["']\)/);
  assert.match(screen, /actions\.chooseChatGptAppPath\(\)/);
  assert.match(screen, /t\(["']选择应用["']\)/);
  assert.match(
    app,
    /isWindows\s*\?\s*\{[\s\S]*?directory:\s*false[\s\S]*?extensions:\s*\[["']exe["']\][\s\S]*?\}\s*:\s*\{[\s\S]*?directory:\s*false[\s\S]*?extensions:\s*\[["']app["']\]/,
    "the macOS picker must choose .app bundles as files instead of only allowing folders",
  );
});

test("exposes diagnostic log controls on the visible About settings route", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const screen = readFileSync(
    new URL("../screens/diagnostics/AboutScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /diagnosticLogEnabled=\{settingsForm\.diagnosticLogEnabled\}/);
  assert.match(screen, /diagnosticLogEnabled:\s*boolean/);
  assert.match(screen, /actions\.openLogFolder\(\)/);
  assert.match(
    screen,
    /actions\.setDiagnosticLogEnabled\(event\.currentTarget\.checked\)/,
  );
  assert.match(screen, /checked=\{diagnosticLogEnabled\}/);
  assert.match(screen, /t\(["']打开日志文件夹["']\)/);
});

test("presents diagnostic logging as a title-only preference row", () => {
  const settings = readFileSync(
    new URL("../screens/diagnostics/AboutScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(settings, /<strong>\{t\(["']日志记录["']\)\}<\/strong>/);
  assert.doesNotMatch(settings, /正在记录运行诊断信息|已关闭；不会写入 chatgpt-plus\.log。/);
  assert.doesNotMatch(settings, /className=["']diagnostic-log-copy["'][\s\S]*?<small>/);
});

test("persists the diagnostic logging toggle immediately without a success notice", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const settings = readFileSync(
    new URL("../screens/diagnostics/AboutScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(settings, /onChange=\{\(event\) => actions\.setDiagnosticLogEnabled\(event\.currentTarget\.checked\)\}/);
  assert.match(
    app,
    /setDiagnosticLogEnabled:\s*\(enabled[^]*?settingsAutosaveRef\.current\?\.saveNow\(\{[^]*?mode:\s*"manual"/,
  );
  assert.match(
    app,
    /request\.mode === "manual"[^]*?managerActions\.settings\.save\(request\.settings\)/,
  );
  assert.match(
    app,
    /if \(requested\.mode === "autosave"\) showNotice\(t\("设置保存"\), result\.message, result\.status\)/,
  );
});

test("notifies only after a successful provider create or delete save", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  assert.match(app, /const profileMutation = normalized\.relayProfiles\.length > settingsForm\.relayProfiles\.length/);
  assert.match(app, /if \(isSuccessStatus\(result\.status\) && profileMutation\)/);
  assert.match(app, /profileMutation === "created" \? t\("供应商配置已创建。"\) : t\("供应商配置已删除。"\)/);
  assert.match(app, /else if \(!silent \|\| !isSuccessStatus\(result\.status\)\)/);
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
