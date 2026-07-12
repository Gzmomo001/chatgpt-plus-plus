import { invoke } from "@tauri-apps/api/core";

import type {
  BackendSettings,
  CcsProvidersResult,
  CodexContextEntries,
  CommandResult,
  ContextKind,
  EnvConflict,
  EnvConflictsResult,
  ExtractRelayCommonConfigResult,
  ProviderDoctorResult,
  RelayFilesResult,
  RelayProfileView,
  SettingsResult,
} from "./contracts";
import type { DiagnosticsResult, LogsResult, UpdateResult } from "@/shared/contracts/diagnostics";
import type { OverviewResult } from "@/shared/contracts/overview";
import type { AdsResult } from "@/shared/contracts/recommendations";
import type {
  DeleteLocalSessionResult,
  ExportLocalSessionResult,
  LocalSession,
  LocalSessionUsageResult,
  LocalSessionsResult,
  ProviderSyncTargetsResult,
} from "@/shared/contracts/sessions";
import type { ScriptMarketResult, UserScriptInventory } from "@/shared/contracts/user-scripts";
import type { PluginMarketplaceInventoryResult } from "@/shared/contracts/plugins";

export const TAURI_COMMAND_NAMES = [
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
  "export_local_session_markdown",
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
  "load_local_session_usage",
  "load_overview",
  "load_pending_provider_import",
  "load_provider_sync_targets",
  "load_settings",
  "load_watcher_state",
  "manager_exit_app",
  "manager_hide_to_tray",
  "mutate_plugin",
  "open_external_url",
  "perform_update",
  "plugin_marketplace_inventory",
  "read_latest_logs",
  "read_live_context_entries",
  "read_relay_files",
  "refresh_script_market",
  "refresh_plugin_marketplace",
  "refresh_remote_plugin_marketplace",
  "register_plugin_marketplace",
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
] as const;

export type TauriCommandName = (typeof TAURI_COMMAND_NAMES)[number];
export type InvokeManagerCommand = <T>(
  command: TauriCommandName,
  args?: Record<string, unknown>,
) => Promise<T>;

export type RelayResult = CommandResult<{
  authenticated: boolean;
  authSource: string;
  accountLabel: string | null;
  configPath: string;
  configured: boolean;
  requiresOpenaiAuth: boolean;
  hasBearerToken: boolean;
  backupPath: string | null;
}>;

type RelayPayload = Omit<RelayResult, "status" | "message">;

export type ContextEntriesResult = CommandResult<{
  settings: BackendSettings;
  entries: CodexContextEntries;
}>;

export type LiveContextEntriesResult = CommandResult<{
  entries: CodexContextEntries;
}>;

export type RelaySwitchResult = CommandResult<{
  settings: BackendSettings;
  settingsPath: string;
  userScripts: UserScriptInventory;
  relay: RelayPayload;
}>;

export type RelayProfileTestResult = CommandResult<{
  httpStatus: number;
  endpoint: string;
  responsePreview: string;
}>;

export type StepwiseTestResult = CommandResult<{ itemCount: number; error: string }>;
export type RelayProfileModelsResult = CommandResult<{ models: string[]; endpoint: string }>;

export type ProviderImportRequest = {
  name: string;
  baseUrl: string;
  apiKey: string;
  wireApi: string;
  relayMode: string;
  configContents: string;
  authContents: string;
};

export type PendingProviderImportResult = CommandResult<{
  pending: ProviderImportRequest | null;
}>;

export type RemoveEnvConflictsResult = CommandResult<{
  removed: Array<{ name: string; removedProcess: boolean; removedUser: boolean }>;
  backupPath: string | null;
  remaining: EnvConflict[];
}>;

export type ProviderSyncPayload = {
  syncStatus?: string;
  targetProvider?: string;
  changedSessionFiles?: number;
  skippedLockedRolloutFiles?: string[];
  sqliteRowsUpdated?: number;
  sqliteProviderRowsUpdated?: number;
  sqliteUserEventRowsUpdated?: number;
  sqliteCwdRowsUpdated?: number;
  updatedWorkspaceRoots?: number;
  encryptedContentWarning?: string | null;
};

export type WatcherResult = CommandResult<{ enabled: boolean; disabledFlag: string }>;
export type InstallResult = CommandResult<{
  appShortcut: { installed: boolean; path: string | null };
}>;
export type StartupResult = CommandResult<{ showUpdate: boolean }>;

export type PluginMarketplaceRepairResult = CommandResult<{
  codexHome: string;
  marketplaceRoot?: string | null;
  initialized: boolean;
  configured: boolean;
  needsRepair: boolean;
}>;

export type RemotePluginMarketplaceResult = CommandResult<{
  codexHome: string;
  marketplaceRoot?: string | null;
  configRegistered: boolean;
  needsRepair: boolean;
  pluginCount: number;
  skillCount: number;
}>;

export type LaunchRequest = { appPath: string; debugPort: number; helperPort: number };
export type UpdateRelease = {
  version: string;
  url: string;
  body: string;
  assetName: string;
  assetUrl: string;
};
export type TrayLabels = { showLabel: string; quitLabel: string; windowTitle: string };
export type WatcherAction = "install" | "uninstall" | "enable" | "disable";

const watcherCommands: Record<WatcherAction, TauriCommandName> = {
  install: "install_watcher",
  uninstall: "uninstall_watcher",
  enable: "enable_watcher",
  disable: "disable_watcher",
};

type WireSettingsResult = Omit<SettingsResult, "settingsPath" | "userScripts"> & {
  settings_path: string;
  user_scripts: UserScriptInventory;
};
type WireScriptMarketResult = Omit<ScriptMarketResult, "userScripts"> & {
  user_scripts: UserScriptInventory;
};
type WireOverviewResult = CommandResult<{
  codex_app: OverviewResult["codexApp"];
  codex_version: OverviewResult["codexVersion"];
  app_shortcut: OverviewResult["appShortcut"];
  legacy_management_shortcut: { status: string; path: string | null };
  latest_launch: null | {
    status: string;
    message: string;
    started_at_ms: number;
    debug_port: number | null;
    helper_port: number | null;
    codex_app: string | null;
  };
  current_version: string;
  update_status: string;
  settings_path: string;
  logs_path: string;
}>;
type WireWatcherResult = Omit<WatcherResult, "disabledFlag"> & { disabled_flag: string };
type WireInstallResult = Omit<InstallResult, "appShortcut"> & {
  app_shortcut: InstallResult["appShortcut"];
  legacy_management_shortcut: { installed: boolean; path: string | null };
};
type WireDeleteLocalSessionResult = Omit<
  DeleteLocalSessionResult,
  "sessionId" | "undoToken" | "backupPath"
> & {
  session_id: string;
  undo_token: string | null;
  backup_path: string | null;
};

const mapSettingsResult = ({ settings_path, user_scripts, ...result }: WireSettingsResult): SettingsResult => ({
  ...result,
  settingsPath: settings_path,
  userScripts: user_scripts,
});
const mapScriptMarketResult = ({ user_scripts, ...result }: WireScriptMarketResult): ScriptMarketResult => ({
  ...result,
  userScripts: user_scripts,
});
const mapOverviewResult = ({
  codex_app,
  codex_version,
  app_shortcut,
  legacy_management_shortcut: _legacyManagementShortcut,
  latest_launch,
  current_version,
  update_status,
  settings_path,
  logs_path,
  ...result
}: WireOverviewResult): OverviewResult => ({
  ...result,
  codexApp: codex_app,
  codexVersion: codex_version,
  appShortcut: app_shortcut,
  latestLaunch: latest_launch
    ? {
        status: latest_launch.status,
        message: latest_launch.message,
        startedAtMs: latest_launch.started_at_ms,
        debugPort: latest_launch.debug_port,
        helperPort: latest_launch.helper_port,
        codexApp: latest_launch.codex_app,
      }
    : null,
  currentVersion: current_version,
  updateStatus: update_status,
  settingsPath: settings_path,
  logsPath: logs_path,
});
const mapWatcherResult = ({ disabled_flag, ...result }: WireWatcherResult): WatcherResult => ({
  ...result,
  disabledFlag: disabled_flag,
});
const mapInstallResult = ({
  app_shortcut,
  legacy_management_shortcut: _legacyManagementShortcut,
  ...result
}: WireInstallResult): InstallResult => ({
  ...result,
  appShortcut: app_shortcut,
});
const mapDeletedSession = ({
  session_id,
  undo_token,
  backup_path,
  ...result
}: WireDeleteLocalSessionResult): DeleteLocalSessionResult => ({
  ...result,
  sessionId: session_id,
  undoToken: undo_token,
  backupPath: backup_path,
});
export function createManagerActions(call: InvokeManagerCommand) {
  const launch = (command: "launch_chatgpt_plus" | "restart_chatgpt_plus", request: LaunchRequest) =>
    call<CommandResult<Record<string, unknown>>>(command, { request });

  return {
    app: {
      startup: () => call<StartupResult>("startup_options"),
      updateTrayLabels: (labels: TrayLabels) => call<void>("update_tray_labels", labels),
      exit: () => call<void>("manager_exit_app"),
      hideToTray: () => call<void>("manager_hide_to_tray"),
      openExternalUrl: (url: string) =>
        call<CommandResult<Record<string, unknown>>>("open_external_url", { url }),
      writeDiagnostic: (event: string, detail: Record<string, unknown> = {}) =>
        call<void>("write_diagnostic_event", { event, detail }),
    },
    overview: {
      load: () => call<WireOverviewResult>("load_overview").then(mapOverviewResult),
      launch: (request: LaunchRequest) => launch("launch_chatgpt_plus", request),
      restart: (request: LaunchRequest) => launch("restart_chatgpt_plus", request),
    },
    settings: {
      load: () => call<WireSettingsResult>("load_settings").then(mapSettingsResult),
      save: (settings: BackendSettings) =>
        call<WireSettingsResult>("save_settings", { settings }).then(mapSettingsResult),
      reset: () => call<WireSettingsResult>("reset_settings").then(mapSettingsResult),
      resetImageOverlay: () =>
        call<WireSettingsResult>("reset_image_overlay_settings").then(mapSettingsResult),
      testStepwise: (settings: BackendSettings) =>
        call<StepwiseTestResult>("test_stepwise_settings", { settings }),
    },
    userScripts: {
      refreshMarket: () =>
        call<WireScriptMarketResult>("refresh_script_market").then(mapScriptMarketResult),
      install: (id: string) =>
        call<WireScriptMarketResult>("install_market_script", { id }).then(mapScriptMarketResult),
      setEnabled: (key: string, enabled: boolean) =>
        call<WireSettingsResult>("set_user_script_enabled", { key, enabled }).then(mapSettingsResult),
      delete: (key: string) =>
        call<WireSettingsResult>("delete_user_script", { key }).then(mapSettingsResult),
    },
    relay: {
      status: () => call<RelayResult>("relay_status"),
      readFiles: () => call<RelayFilesResult>("read_relay_files"),
      saveFile: (kind: "config" | "auth", contents: string) =>
        call<RelayFilesResult>("save_relay_file", { request: { kind, contents } }),
      checkEnvConflicts: () => call<EnvConflictsResult>("check_env_conflicts"),
      removeEnvConflicts: (names: string[]) =>
        call<RemoveEnvConflictsResult>("remove_env_conflicts", { request: { names } }),
      loadCcsProviders: () => call<CcsProvidersResult>("load_ccs_providers"),
      importCcsProviders: () =>
        call<WireSettingsResult>("import_ccs_providers").then(mapSettingsResult),
      loadPendingImport: () => call<PendingProviderImportResult>("load_pending_provider_import"),
      confirmPendingImport: () =>
        call<WireSettingsResult>("confirm_pending_provider_import").then(mapSettingsResult),
      dismissPendingImport: () =>
        call<PendingProviderImportResult>("dismiss_pending_provider_import"),
      applyOfficialMix: () => call<RelayResult>("apply_relay_injection"),
      applyPureApi: () => call<RelayResult>("apply_pure_api_injection"),
      clearManagedFiles: () => call<RelayResult>("clear_relay_injection"),
      extractCommonConfig: (configContents: string) =>
        call<ExtractRelayCommonConfigResult>("extract_relay_common_config", {
          request: { configContents },
        }),
      testProfile: (profile: RelayProfileView) =>
        call<RelayProfileTestResult>("test_relay_profile", { profile }),
      diagnoseProfile: (profile: RelayProfileView) =>
        call<ProviderDoctorResult>("diagnose_relay_profile", { profile }),
      fetchModels: (profile: RelayProfileView) =>
        call<RelayProfileModelsResult>("fetch_relay_profile_models", { profile }),
      switchProfile: (request: { settings: BackendSettings; targetRelayId: string }) =>
        call<RelaySwitchResult>("switch_relay_profile", { request }),
    },
    context: {
      readLive: () => call<LiveContextEntriesResult>("read_live_context_entries"),
      syncLive: (settings: BackendSettings) =>
        call<LiveContextEntriesResult>("sync_live_context_entries", { request: { settings } }),
      upsert: (request: {
        settings: BackendSettings;
        kind: ContextKind;
        id: string;
        tomlBody: string;
      }) => call<ContextEntriesResult>("upsert_context_entry", { request }),
      delete: (request: { settings: BackendSettings; kind: ContextKind; id: string }) =>
        call<ContextEntriesResult>("delete_context_entry", { request }),
    },
    sessions: {
      list: () => call<LocalSessionsResult>("list_local_sessions"),
      delete: (session: Pick<LocalSession, "id" | "title" | "dbPath">) =>
        call<WireDeleteLocalSessionResult>("delete_local_session", {
          request: { sessionId: session.id, title: session.title, dbPath: session.dbPath },
        }).then(mapDeletedSession),
      exportMarkdown: (
        session: Pick<LocalSession, "id" | "title" | "dbPath">,
        destinationPath?: string,
      ) => call<ExportLocalSessionResult>("export_local_session_markdown", {
        request: {
          sessionId: session.id,
          title: session.title,
          dbPath: session.dbPath,
          destinationPath,
        },
      }),
      loadUsage: (session: Pick<LocalSession, "id" | "title" | "dbPath">) =>
        call<LocalSessionUsageResult>("load_local_session_usage", {
          request: { sessionId: session.id, title: session.title, dbPath: session.dbPath },
        }),
      loadSyncTargets: () => call<ProviderSyncTargetsResult>("load_provider_sync_targets"),
      syncProviders: (targetProvider?: string) =>
        call<CommandResult<ProviderSyncPayload>>("sync_providers_now", { targetProvider }),
    },
    diagnostics: {
      readLogs: (lines = 240) => call<LogsResult>("read_latest_logs", { request: { lines } }),
      copy: () => call<DiagnosticsResult>("copy_diagnostics"),
      checkUpdate: () => call<UpdateResult>("check_update"),
      performUpdate: (release: UpdateRelease | null) =>
        call<UpdateResult>("perform_update", {
          release: release
            ? {
                version: release.version,
                url: release.url,
                body: release.body,
                asset_name: release.assetName,
                asset_url: release.assetUrl,
              }
            : null,
        }),
    },
    maintenance: {
      repairPluginMarketplace: () =>
        call<PluginMarketplaceRepairResult>("repair_plugin_marketplace"),
      remotePluginMarketplaceStatus: () =>
        call<RemotePluginMarketplaceResult>("remote_plugin_marketplace_status"),
      repairRemotePluginMarketplace: () =>
        call<RemotePluginMarketplaceResult>("repair_remote_plugin_marketplace"),
      pluginInventory: () =>
        call<PluginMarketplaceInventoryResult>("plugin_marketplace_inventory"),
      mutatePlugin: (pluginId: string, action: "install" | "uninstall" | "enable" | "disable") =>
        call<PluginMarketplaceInventoryResult>("mutate_plugin", { request: { pluginId, action } }),
      registerPluginMarketplace: (name: string, source: string) =>
        call<PluginMarketplaceInventoryResult>("register_plugin_marketplace", { request: { name, source } }),
      refreshPluginMarketplace: () =>
        call<PluginMarketplaceRepairResult>("refresh_plugin_marketplace"),
      refreshRemotePluginMarketplace: () =>
        call<RemotePluginMarketplaceResult>("refresh_remote_plugin_marketplace"),
      installEntrypoints: () =>
        call<WireInstallResult>("install_entrypoints").then(mapInstallResult),
      uninstallEntrypoints: (removeOwnedData: boolean) =>
        call<WireInstallResult>("uninstall_entrypoints", { options: { removeOwnedData } }).then(mapInstallResult),
      repairShortcuts: () =>
        call<WireInstallResult>("repair_shortcuts").then(mapInstallResult),
      loadWatcher: () => call<WireWatcherResult>("load_watcher_state").then(mapWatcherResult),
      changeWatcher: (action: WatcherAction) =>
        call<WireWatcherResult>(watcherCommands[action]).then(mapWatcherResult),
    },
    recommendations: {
      load: () => call<AdsResult>("load_ads"),
    },
  } as const;
}

export type ManagerActions = ReturnType<typeof createManagerActions>;
export const managerActions = createManagerActions(invoke);
