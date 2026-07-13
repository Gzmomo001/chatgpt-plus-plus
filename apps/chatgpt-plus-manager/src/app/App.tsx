import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  CircleArrowUp,
  Languages,
  Moon,
  RefreshCw,
  Rocket,
  Sun,
} from "lucide-react";
import { RelayProfilesScreen } from "@/screens/relay-profiles/RelayProfilesScreen";
import { OverviewScreen } from "@/screens/overview/OverviewScreen";
import type { OverviewActions } from "@/screens/overview/OverviewScreen";
import { detectLaunchCrash } from "@/screens/overview/presentation";
import { ContextScreen } from "@/screens/context/ContextScreen";
import { AboutScreen } from "@/screens/diagnostics/AboutScreen";
import { SettingsScreen } from "@/screens/settings/SettingsScreen";
import { EnhanceScreen } from "@/screens/enhance/EnhanceScreen";
import type { EnhanceActions, EnhanceView } from "@/screens/enhance/EnhanceScreen";
import { MaintenanceScreen } from "@/screens/maintenance/MaintenanceScreen";
import type {
  MaintenanceActions,
  MaintenanceView,
} from "@/screens/maintenance/MaintenanceScreen";
import { SessionsScreen } from "@/screens/sessions/SessionsScreen";
import type {
  SessionsActions,
  SessionsView,
} from "@/screens/sessions/SessionsScreen";
import {
  createSessionsController,
  type SessionsControllerPorts,
  type SessionsControllerView,
  type SessionsDeleteReport,
  type SessionsDeleteRequest,
  type SessionsIntent,
} from "@/features/sessions/controller";
import { numberOrDefault } from "@/shared/lib/settings";
import type {
  DiagnosticsResult,
  LogsResult,
  UpdateResult,
} from "@/shared/contracts/diagnostics";
import type { OverviewResult } from "@/shared/contracts/overview";
import type { PluginMarketplaceInventoryResult } from "@/shared/contracts/plugins";
import type { LocalSession, ProviderSyncTargetsResult } from "@/shared/contracts/sessions";
import { readContextCatalog } from "@/features/context/config";
import {
  createContextMutationController,
  type ContextMutationController,
  type ContextMutationPorts,
} from "@/features/context/controller";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  BackendSettings,
  CcsProvidersResult,
  CodexContextEntries,
  CommandResult,
  ContextKind,
  EnvConflictsResult,
  ExtractRelayCommonConfigResult,
  ProviderDoctorResult,
  RelayFilesResult,
  RelayProfileView,
  SettingsResult,
  Status,
} from "@/app/contracts";
import {
  managerActions,
  type LiveContextEntriesResult,
  type ProviderImportRequest,
  type ProviderSyncPayload,
  type RelayResult,
  type RemotePluginMarketplaceResult,
  type WatcherAction,
  type WatcherResult,
} from "@/app/actions";
import {
  ConfirmDialog,
  NoticeDialog,
} from "@/app/components/ApplicationDialogs";
import {
  isSuccessStatus,
  loadInitialTheme,
  navigationRoutes,
  routeSubtitle,
  routeTitle,
  stringifyError,
  type Theme,
} from "@/app/presentation";
import { loadInitialRoute, type Route } from "@/app/routes";
import {
  activeRelayProfile,
  defaultSettings,
  normalizeSettings,
} from "@/app/settings-normalization";
import { Button } from "@/shared/ui/button";
import type { TaskProgress } from "@/shared/ui/task-progress";
import { relayProfileSwitchMessage } from "@/features/relay-profiles/presentation";
import {
  PendingProviderImportDialog,
} from "@/features/relay-profiles/components/PendingProviderImportDialog";
import { projectPendingProviderImport } from "@/features/relay-profiles/pending-provider-import";
import { relaySwitchIssue } from "@/features/relay-profiles/controller";
import type {
  AggregateRelayProfile,
} from "@/features/relay-profiles/types";
import { getLanguage, t, tf, toggleLanguage } from "@/i18n";
import {
  providerSyncProgressMessage,
  truncateSessionDeletePreview,
} from "@/features/sessions/presentation";

const PROTOCOL_PROXY_BASE_URL = "http://127.0.0.1:57321/v1";
const CHAT_UPSTREAM_BASE_URL_KEY = "chatgpt_plus_chat_base_url";

type ProviderSyncProgress = {
  active: boolean;
  percent: number;
  message: string;
  result: CommandResult<ProviderSyncPayload> | null;
};

export function App() {
  const [theme, setTheme] = useState<Theme>(() => loadInitialTheme());
  const [route, setRoute] = useState<Route>(() =>
    loadInitialRoute(typeof window === "undefined" ? undefined : window.location),
  );
  const [notice, setNotice] = useState<{ title: string; message: string; status?: Status } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [overview, setOverview] = useState<OverviewResult | null>(null);
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [relay, setRelay] = useState<RelayResult | null>(null);
  const [relayFiles, setRelayFiles] = useState<RelayFilesResult | null>(null);
  const [envConflicts, setEnvConflicts] = useState<EnvConflictsResult | null>(null);
  const [ccsProviders, setCcsProviders] = useState<CcsProvidersResult | null>(null);
  const [pendingProviderImport, setPendingProviderImport] = useState<ProviderImportRequest | null>(null);
  const [sessionsControllerView, setSessionsControllerView] = useState<SessionsControllerView>({
    dbPath: null,
    rows: [],
    selectedSessionIds: [],
    selectionMode: false,
    pendingOperation: null,
    activeSessionId: null,
    exportResult: null,
    usageResult: null,
  });
  const sessionsControllerPortsRef = useRef<SessionsControllerPorts>({
    loadSessions: async () => null,
    deleteSession: async () => null,
    exportSession: async () => null,
    loadUsage: async () => null,
    confirmDelete: async () => false,
    reportDelete: () => {},
    viewChanged: setSessionsControllerView,
  });
  const sessionsControllerRef = useRef<ReturnType<typeof createSessionsController> | null>(null);
  if (!sessionsControllerRef.current) {
    sessionsControllerRef.current = createSessionsController({
      loadSessions: (silent) => sessionsControllerPortsRef.current.loadSessions(silent),
      deleteSession: (session) => sessionsControllerPortsRef.current.deleteSession(session),
      exportSession: (session) => sessionsControllerPortsRef.current.exportSession(session),
      loadUsage: (session) => sessionsControllerPortsRef.current.loadUsage(session),
      confirmDelete: (request) => sessionsControllerPortsRef.current.confirmDelete(request),
      reportDelete: (report) => sessionsControllerPortsRef.current.reportDelete(report),
      viewChanged: (view) => sessionsControllerPortsRef.current.viewChanged(view),
    });
  }
  const [liveContextEntries, setLiveContextEntries] = useState<CodexContextEntries | null>(null);
  const [logs, setLogs] = useState<LogsResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [watcher, setWatcher] = useState<WatcherResult | null>(null);
  const [update, setUpdate] = useState<UpdateResult | null>(null);
  const [updateInstallProgress, setUpdateInstallProgress] = useState<TaskProgress>({
    active: false,
    percent: 0,
    message: t("尚未运行安装包更新。"),
  });
  const [launchForm, setLaunchForm] = useState({
    appPath: "",
  });
  const prevLaunchStatusRef = useRef<string | null>(null);
  const [settingsForm, setSettingsForm] = useState<BackendSettings>({ ...defaultSettings });
  const [providerSyncProgress, setProviderSyncProgress] = useState<ProviderSyncProgress>({
    active: false,
    percent: 0,
    message: t("尚未运行历史会话修复。"),
    result: null,
  });
  const [pluginMarketplaceProgress, setPluginMarketplaceProgress] = useState<TaskProgress>({
    active: false,
    percent: 0,
    message: t("尚未运行插件市场修复。"),
  });
  const [remotePluginMarketplace, setRemotePluginMarketplace] = useState<RemotePluginMarketplaceResult | null>(null);
  const [remotePluginMarketplaceProgress, setRemotePluginMarketplaceProgress] = useState<TaskProgress>({
    active: false,
    percent: 0,
    message: t("尚未检查官方远端插件缓存。"),
  });
  const [pluginInventory, setPluginInventory] = useState<PluginMarketplaceInventoryResult | null>(null);
  const [pluginInventoryPending, setPluginInventoryPending] = useState<string | null>(null);
  const [providerSyncTargets, setProviderSyncTargets] = useState<ProviderSyncTargetsResult | null>(null);
  const [selectedProviderSyncTarget, setSelectedProviderSyncTarget] = useState("");
  const [removeOwnedData, setRemoveOwnedData] = useState(false);
  const [relaySwitching, setRelaySwitching] = useState(false);

  const logDiagnostic = (event: string, detail: Record<string, unknown> = {}) => {
    void managerActions.app.writeDiagnostic(event, detail).catch(() => {});
  };

  const run = async <T,>(task: () => Promise<T>): Promise<T | null> => {
    try {
      return await task();
    } catch (error) {
      showNotice(t("调用失败"), stringifyError(error), "failed");
      return null;
    }
  };

  const refreshOverview = async (silent = false) => {
    const result = await run(() => managerActions.overview.load());
    if (result) {
      const prev = prevLaunchStatusRef.current;
      const current = result.latestLaunch?.status;
      const transition = detectLaunchCrash(prev, current);
      if (transition) {
        showNotice(t(transition.title), tf(transition.message, transition.messageArgs), transition.status);
      }
      prevLaunchStatusRef.current = current ?? null;
      setOverview(result);
      if (!silent) showResultNotice(t("概览已检查"), result, { silentSuccess: true });
    }
  };

  const refreshSettings = async (silent = false) => {
    const result = await run(() => managerActions.settings.load());
    if (result) {
      setSettings(result);
      const normalized = normalizeSettings(result.settings);
      setSettingsForm(normalized);
      setLaunchForm((current) => ({
        ...current,
        appPath: current.appPath || result.settings.codexAppPath || "",
      }));
      if (!silent) showResultNotice(t("设置已加载"), result, { silentSuccess: true });
      return normalized;
    }
    return null;
  };

  const refreshRelay = async (silent = false) => {
    const result = await run(() => managerActions.relay.status());
    if (result) {
      setRelay(result);
      if (!silent) showResultNotice(t("登录状态"), result, { silentSuccess: true });
    }
  };

  const refreshRelayFiles = async (silent = false) => {
    const result = await run(() => managerActions.relay.readFiles());
    if (result) {
      setRelayFiles(result);
      if (!silent) showResultNotice(t("配置文件"), result, { silentSuccess: true });
    }
    return result;
  };

  const refreshEnvConflicts = async (silent = false) => {
    const result = await run(() => managerActions.relay.checkEnvConflicts());
    if (result) {
      setEnvConflicts(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("环境变量检测"), result, { silentSuccess: true });
    }
    return result;
  };

  const removeEnvConflicts = async (names: string[]) => {
    const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    if (!uniqueNames.length) return;
    if (!window.confirm(tf("删除这些环境变量？\n\n{0}\n\n删除前会写入备份。", [uniqueNames.join("\n")]))) return;
    const result = await run(() => managerActions.relay.removeEnvConflicts(uniqueNames));
    if (result) {
      setEnvConflicts({
        status: result.status,
        message: result.message,
        conflicts: result.remaining,
      });
      showNotice(t("环境变量清理"), result.message, result.status);
    }
  };

  const refreshCcsProviders = async (silent = false) => {
    const result = await run(() => managerActions.relay.loadCcsProviders());
    if (result) {
      setCcsProviders(result);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("cc-switch 导入"), result, { silentSuccess: true });
    }
    return result;
  };

  const importCcsProviders = async () => {
    const result = await run(() => managerActions.relay.importCcsProviders());
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showResultNotice(t("cc-switch 导入"), result);
      await refreshCcsProviders(true);
    }
  };

  const refreshPendingProviderImport = async (silent = true) => {
    const result = await run(() => managerActions.relay.loadPendingImport());
    if (result) {
      setPendingProviderImport(result.pending);
      if (!silent && !isSuccessStatus(result.status)) showResultNotice(t("ChatGPT++ 导入"), result, { silentSuccess: true });
    }
    return result;
  };

  const confirmPendingProviderImport = async () => {
    const result = await run(() => managerActions.relay.confirmPendingImport());
    if (result) {
      setPendingProviderImport(null);
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showResultNotice(t("ChatGPT++ 导入"), result);
      await refreshCcsProviders(true);
    }
  };

  const dismissPendingProviderImport = async () => {
    const result = await run(() => managerActions.relay.dismissPendingImport());
    if (result) {
      setPendingProviderImport(null);
      showResultNotice(t("ChatGPT++ 导入"), result, { silentSuccess: true });
    }
  };

  const loadLocalSessions = async (silent = false) => {
    const result = await run(() => managerActions.sessions.list());
    if (result) {
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("会话管理"), result, { silentSuccess: true });
    }
    return result;
  };

  const requestDeleteLocalSession = (session: LocalSession) =>
    managerActions.sessions.delete(session);

  const confirmSessionDelete = (title: string, message: string) =>
    new Promise<boolean>((resolve) => {
      setConfirmDialog({
        title,
        message,
        confirmText: t("确认删除"),
        cancelText: t("取消"),
        resolve,
      });
    });

  const confirmSessionsDelete = (request: SessionsDeleteRequest) => {
    if (request.kind === "single") {
      const session = request.sessions[0];
      const title = session.title || session.id;
      return confirmSessionDelete(
        t("删除会话"),
        tf("删除会话“{0}”？此操作会删除本地数据库记录和 rollout 文件，并创建备份。", [title]),
      );
    }
    const preview = request.sessions
      .slice(0, 6)
      .map((session) => `- ${truncateSessionDeletePreview(session.title || session.id)}`)
      .join("\n");
    const extraCount = request.sessions.length > 6 ? tf("\n...以及另外 {0} 个会话", [request.sessions.length - 6]) : "";
    return confirmSessionDelete(
      t("批量删除会话"),
      tf("删除选中的 {0} 个会话？此操作会删除本地数据库记录和 rollout 文件，并为每个会话创建备份。\n\n{1}{2}", [request.sessions.length, preview, extraCount]),
    );
  };

  const reportSessionsDelete = (report: SessionsDeleteReport) => {
    if (report.kind === "single") {
      showResultNotice(t("会话删除"), report.result);
      return;
    }
    if (report.failedTitles.length) {
      showNotice(
        t("批量删除会话"),
        tf("已删除 {0} 个，失败 {1} 个：{2}", [report.succeeded, report.failedTitles.length, report.failedTitles.slice(0, 3).map(truncateSessionDeletePreview).join(t("、"))]),
        report.succeeded ? "ok" : "failed",
      );
    } else {
      showNotice(t("批量删除会话"), tf("已删除 {0} 个会话。", [report.succeeded]), "ok");
    }
  };

  const exportLocalSession = async (session: LocalSession) => {
    const prepared = await run(() => managerActions.sessions.exportMarkdown(session));
    if (!prepared || !isSuccessStatus(prepared.status)) {
      if (prepared) showResultNotice(t("Markdown 导出"), prepared);
      return prepared;
    }
    const destination = await save({
      defaultPath: prepared.filename ?? `${session.title || session.id}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!destination) return null;
    const result = await run(() => managerActions.sessions.exportMarkdown(session, destination));
    if (result) showResultNotice(t("Markdown 导出"), result);
    return result;
  };

  const loadLocalSessionUsage = async (session: LocalSession) => {
    const result = await run(() => managerActions.sessions.loadUsage(session));
    if (result && !isSuccessStatus(result.status)) {
      showResultNotice(t("Token 使用历史"), result);
    }
    return result;
  };

  sessionsControllerPortsRef.current = {
    loadSessions: loadLocalSessions,
    deleteSession: (session) => run(() => requestDeleteLocalSession(session)),
    exportSession: exportLocalSession,
    loadUsage: loadLocalSessionUsage,
    confirmDelete: confirmSessionsDelete,
    reportDelete: reportSessionsDelete,
    viewChanged: setSessionsControllerView,
  };
  const refreshLocalSessions = (silent = false) =>
    sessionsControllerRef.current!.refresh(silent);
  const executeSessionsAction = (intent: SessionsIntent) =>
    sessionsControllerRef.current!.execute(intent);

  const refreshLiveContextEntries = async (silent = false) => {
    const result = await run(() => managerActions.context.readLive());
    if (result) {
      setLiveContextEntries(result.entries);
      if (!silent || !isSuccessStatus(result.status)) showResultNotice(t("工具与插件"), result, { silentSuccess: true });
    }
    return result;
  };

  const requestContextLiveSync = async (next: BackendSettings) =>
    run(() => managerActions.context.syncLive(next));

  const refreshLogs = async (silent = false) => {
    const result = await run(() => managerActions.diagnostics.readLogs());
    if (result) {
      setLogs(result);
      if (!silent) showResultNotice(t("日志已刷新"), result, { silentSuccess: true });
    }
  };

  const refreshDiagnostics = async (silent = false) => {
    const result = await run(() => managerActions.diagnostics.copy());
    if (result) {
      setDiagnostics(result);
      if (!silent) showResultNotice(t("诊断已生成"), result, { silentSuccess: true });
    }
  };

  const refreshWatcher = async (silent = false) => {
    const result = await run(() => managerActions.maintenance.loadWatcher());
    if (result) {
      setWatcher(result);
      if (!silent) showResultNotice(t("Watcher 状态"), result, { silentSuccess: true });
    }
  };

  const navigate = async (next: Route) => {
    if (route === "sessions" && next !== "sessions") {
      sessionsControllerRef.current!.reset();
    }
    setRoute(next);
    if (next === "overview") await refreshOverview(true);
    if (next === "relay") {
      await refreshSettings(true);
      await refreshRelay(true);
      await refreshRelayFiles(true);
      await refreshEnvConflicts(true);
      await refreshCcsProviders(true);
    }
    if (next === "sessions") {
      await refreshSettings(true);
      await refreshLocalSessions(true);
      await refreshProviderSyncTargets(true);
    }
    if (next === "context") {
      await refreshSettings(true);
      await refreshRelayFiles(true);
      await refreshLiveContextEntries(true);
    }
    if (next === "settings") await refreshSettings(true);
    if (next === "about") {
      await refreshOverview(true);
      await refreshLogs(true);
      await refreshDiagnostics(true);
    }
    if (next === "maintenance") {
      await refreshOverview(true);
      await refreshWatcher(true);
    }
  };

  const launch = async () => {
    const result = await launchCommand("launch");
    if (result) {
      showNotice(t("启动任务"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const restart = async () => {
    const result = await launchCommand("restart");
    if (result) {
      showNotice(t("重启 ChatGPT++"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const launchCommand = async (intent: "launch" | "restart") => {
    const request = {
      appPath: launchForm.appPath,
    };
    const result = await run(() => managerActions.overview[intent](request));
    return result;
  };

  const repairPluginMarketplace = async () => {
    if (pluginMarketplaceProgress.active) return;
    setPluginMarketplaceProgress({ active: true, percent: 8, message: t("正在检查本地插件市场…") });
    const progressTimer = window.setInterval(() => {
      setPluginMarketplaceProgress((current) => {
        if (!current.active) return current;
        const nextPercent = Math.min(92, current.percent + 9);
        const message =
          nextPercent < 28
            ? t("正在连接 openai/plugins…")
            : nextPercent < 62
              ? t("正在下载插件市场快照…")
              : nextPercent < 84
                ? t("正在解压并校验插件文件…")
                : t("正在写入 Codex 配置…");
        return { ...current, percent: nextPercent, message };
      });
    }, 500);
    try {
      const result = await run(() => managerActions.maintenance.repairPluginMarketplace());
      if (result) {
        setPluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: result.message,
        });
        showNotice(t("插件市场修复"), result.message, result.status);
      } else {
        setPluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: t("插件市场修复失败，请查看错误提示后重试。"),
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const refreshRemotePluginMarketplace = async (silent = false) => {
    const result = await run(() => managerActions.maintenance.remotePluginMarketplaceStatus());
    if (result) {
      setRemotePluginMarketplace(result);
      if (!silent) {
        setRemotePluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: result.message,
        });
      }
      if (!silent) showNotice(t("官方远端插件缓存"), result.message, result.status);
    }
    return result;
  };

  const repairRemotePluginMarketplace = async () => {
    if (remotePluginMarketplaceProgress.active) return;
    setRemotePluginMarketplaceProgress({
      active: true,
      percent: 18,
      message: t("正在检查内置官方远端插件缓存…"),
    });
    const progressTimer = window.setInterval(() => {
      setRemotePluginMarketplaceProgress((current) => {
        if (!current.active) return current;
        const nextPercent = Math.min(92, current.percent + 18);
        const message =
          nextPercent < 50
            ? t("正在释放内置远端插件快照…")
            : nextPercent < 78
              ? t("正在注册官方远端插件市场…")
              : t("正在刷新官方远端插件缓存状态…");
        return { ...current, percent: nextPercent, message };
      });
    }, 450);
    try {
      const result = await run(() => managerActions.maintenance.repairRemotePluginMarketplace());
      if (result) {
        setRemotePluginMarketplace(result);
        setRemotePluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: result.message,
        });
        showNotice(t("官方远端插件缓存"), result.message, result.status);
      } else {
        setRemotePluginMarketplaceProgress({
          active: false,
          percent: 100,
          message: t("官方远端插件缓存修复失败，请查看错误提示后重试。"),
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const refreshPluginInventory = async (silent = false) => {
    const result = await run(() => managerActions.maintenance.pluginInventory());
    if (result) {
      setPluginInventory(result);
      if (!silent && !isSuccessStatus(result.status)) showResultNotice(t("插件与技能库存"), result);
    }
    return result;
  };

  const mutatePlugin = async (pluginId: string, action: "install" | "uninstall" | "enable" | "disable") => {
    if (pluginInventoryPending) return;
    setPluginInventoryPending(pluginId);
    try {
      const result = await run(() => managerActions.maintenance.mutatePlugin(pluginId, action));
      if (result) {
        setPluginInventory(result);
        showResultNotice(t("插件管理"), result, { silentSuccess: true });
      }
    } finally {
      setPluginInventoryPending(null);
    }
  };

  const registerPluginMarketplace = async (name: string) => {
    if (pluginInventoryPending) return;
    const source = await open({ directory: true, multiple: false, title: t("选择插件市场目录") });
    if (typeof source !== "string") return;
    setPluginInventoryPending("register");
    try {
      const result = await run(() => managerActions.maintenance.registerPluginMarketplace(name, source));
      if (result) {
        setPluginInventory(result);
        showResultNotice(t("注册插件市场"), result, { silentSuccess: true });
      }
    } finally {
      setPluginInventoryPending(null);
    }
  };

  const upgradePluginMarketplace = async () => {
    if (pluginInventoryPending) return;
    setPluginInventoryPending("refresh-official");
    try {
      const result = await run(() => managerActions.maintenance.refreshPluginMarketplace());
      if (result) showResultNotice(t("升级官方市场"), result, { silentSuccess: true });
      await refreshPluginInventory(true);
    } finally {
      setPluginInventoryPending(null);
    }
  };

  const upgradeRemotePluginMarketplace = async () => {
    if (pluginInventoryPending) return;
    setPluginInventoryPending("refresh-remote");
    try {
      const result = await run(() => managerActions.maintenance.refreshRemotePluginMarketplace());
      if (result) {
        setRemotePluginMarketplace(result);
        showResultNotice(t("刷新内置远端快照"), result, { silentSuccess: true });
      }
      await refreshPluginInventory(true);
    } finally {
      setPluginInventoryPending(null);
    }
  };

  const installEntrypoints = async () => {
    const result = await run(() => managerActions.maintenance.installEntrypoints());
    if (result) {
      showNotice(t("入口安装"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const uninstallEntrypoints = async () => {
    const result = await run(() => managerActions.maintenance.uninstallEntrypoints(removeOwnedData));
    if (result) {
      showNotice(t("入口卸载"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const repairShortcuts = async () => {
    const result = await run(() => managerActions.maintenance.repairShortcuts());
    if (result) {
      showNotice(t("快捷方式修复"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const watcherAction = async (action: WatcherAction) => {
    const result = await run(() => managerActions.maintenance.changeWatcher(action));
    if (result) {
      setWatcher(result);
      showNotice(t("Watcher 操作"), result.message, result.status);
    }
  };

  const checkUpdate = async (silent = false) => {
    const result = await run(() => managerActions.diagnostics.checkUpdate());
    if (result) {
      setUpdate(result);
      if (!silent || result.updateAvailable) {
        showNotice(t("GitHub Release 检查"), result.message, result.status);
      }
    }
  };

  const performUpdate = async () => {
    if (updateInstallProgress.active) return;
    const release =
      update?.latestVersion && update.assetName && update.assetUrl
        ? {
            version: update.latestVersion,
            url: "",
            body: update.releaseSummary ?? "",
            assetName: update.assetName,
            assetUrl: update.assetUrl,
          }
        : null;
    setUpdateInstallProgress({
      active: true,
      percent: 8,
      message: t("正在准备安装包下载…"),
    });
    const progressTimer = window.setInterval(() => {
      setUpdateInstallProgress((current) => {
        if (!current.active) return current;
        const nextPercent = Math.min(92, current.percent + 10);
        const message =
          nextPercent < 32
            ? t("正在获取 GitHub Release 信息…")
            : nextPercent < 72
              ? t("正在下载安装包…")
              : t("正在启动安装包…");
        return { ...current, percent: nextPercent, message };
      });
    }, 500);
    try {
      const result = await run(() => managerActions.diagnostics.performUpdate(release));
      if (result) {
        setUpdate(result);
        setUpdateInstallProgress({
          active: false,
          percent: result.progress ?? 100,
          message: result.message,
        });
        showNotice(t("更新安装"), result.message, result.status);
      } else {
        setUpdateInstallProgress({
          active: false,
          percent: 100,
          message: t("安装包更新失败，请查看错误提示后重试。"),
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const saveSettings = async () => {
    const next = normalizeSettings(settingsForm);
    const result = await run(() => managerActions.settings.save(next));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showNotice(t("设置保存"), result.message, result.status);
    }
  };

  const saveSettingsValue = async (next: BackendSettings, silent = true) => {
    const normalized = normalizeSettings(next);
    setSettingsForm(normalized);
    const result = await run(() => managerActions.settings.save(normalized));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("设置保存"), result.message, result.status);
    }
  };

  const resetSettings = async () => {
    const result = await run(() => managerActions.settings.reset());
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      showNotice(t("设置重置"), result.message, result.status);
    }
  };

  const refreshProviderSyncTargets = async (silent = false) => {
    const result = await run(() => managerActions.sessions.loadSyncTargets());
    if (result) {
      setProviderSyncTargets(result);
      const targets = result.targets ?? [];
      const saved = settingsForm.providerSyncLastSelectedProvider;
      const preferred =
        targets.find((target) => target.id === saved)?.id ||
        targets.find((target) => target.isCurrentProvider)?.id ||
        targets[0]?.id ||
        "openai";
      setSelectedProviderSyncTarget((current) => (targets.some((target) => target.id === current) ? current : preferred));
      if (!silent && !isSuccessStatus(result.status)) showNotice(t("Provider 同步目标"), result.message, result.status);
    }
    return result;
  };

  const syncProvidersNow = async () => {
    if (providerSyncProgress.active) return;
    setProviderSyncProgress({
      active: true,
      percent: 12,
      message: selectedProviderSyncTarget ? tf("正在同步到 {0}…", [selectedProviderSyncTarget]) : t("正在扫描历史会话与索引…"),
      result: null,
    });
    const progressTimer = window.setInterval(() => {
      setProviderSyncProgress((current) => {
        if (!current.active) return current;
        return {
          ...current,
          percent: Math.min(88, current.percent + 8),
          message: current.percent < 40 ? t("正在检查会话 provider 标记…") : t("正在写入修复与备份…"),
        };
      });
    }, 350);
    try {
      const targetProvider = selectedProviderSyncTarget || undefined;
      const result = await run(() => managerActions.sessions.syncProviders(targetProvider));
      if (result) {
        setProviderSyncProgress({
          active: false,
          percent: 100,
          message: providerSyncProgressMessage(result),
          result,
        });
        if (targetProvider) {
          const next = {
            ...settingsForm,
            providerSyncLastSelectedProvider: targetProvider,
            providerSyncSavedProviders: Array.from(
              new Set([...(settingsForm.providerSyncSavedProviders ?? []), targetProvider]),
            ).sort(),
          };
          setSettingsForm(next);
        }
        await refreshProviderSyncTargets(true);
        showNotice(t("历史会话修复"), result.message, result.status);
      } else {
        setProviderSyncProgress({
          active: false,
          percent: 100,
          message: t("历史会话修复失败，请查看错误提示后重试。"),
          result: null,
        });
      }
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const applyRelayInjection = async (silent = false) => {
    const settingsResult = await run(() => managerActions.settings.save(settingsForm));
    if (settingsResult) {
      setSettings(settingsResult);
      setSettingsForm(normalizeSettings(settingsResult.settings));
      if (!isSuccessStatus(settingsResult.status)) {
        showNotice(t("设置保存"), settingsResult.message, settingsResult.status);
        return false;
      }
    } else {
      return false;
    }
    const result = await run(() => managerActions.relay.applyOfficialMix());
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("官方混入 API Key"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && result.configured;
  };

  const applyPureApiInjection = async (silent = false) => {
    const settingsResult = await run(() => managerActions.settings.save(settingsForm));
    if (settingsResult) {
      setSettings(settingsResult);
      setSettingsForm(normalizeSettings(settingsResult.settings));
      if (!isSuccessStatus(settingsResult.status)) {
        showNotice(t("设置保存"), settingsResult.message, settingsResult.status);
        return false;
      }
    } else {
      return false;
    }
    const result = await run(() => managerActions.relay.applyPureApi());
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("纯 API 模式"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && result.configured;
  };

  const clearRelayInjection = async (silent = false) => {
    const result = await run(() => managerActions.relay.clearManagedFiles());
    if (result) {
      setRelay(result);
      await refreshRelayFiles(true);
      if (!silent || !isSuccessStatus(result.status)) showNotice(t("官方登录模式"), result.message, result.status);
    }
    return !!result && isSuccessStatus(result.status) && !result.configured;
  };

  const saveRelayFile = async (kind: "config" | "auth", contents: string, silent = false) => {
    const result = await run(() => managerActions.relay.saveFile(kind, contents));
    if (result) {
      setRelayFiles(result);
      if (!silent || !isSuccessStatus(result.status)) {
        showNotice(kind === "config" ? "config.toml" : "auth.json", result.message, result.status);
      }
      await refreshRelay(true);
    }
  };

  const requestContextUpsert = async (next: BackendSettings, kind: ContextKind, id: string, tomlBody: string) =>
    run(() => managerActions.context.upsert({ settings: next, kind, id, tomlBody }));

  const requestContextDelete = async (next: BackendSettings, kind: ContextKind, id: string) =>
    run(() => managerActions.context.delete({ settings: next, kind, id }));

  const extractRelayCommonConfig = async (configContents: string) => {
    const result = await run(() => managerActions.relay.extractCommonConfig(configContents));
    if (result) showResultNotice(t("通用配置文件"), result);
    return result && isSuccessStatus(result.status) ? result : null;
  };

  const testRelayProfile = async (profile: RelayProfileView) => {
    const result = await run(() => managerActions.relay.testProfile(profile));
    if (result) showNotice(t("供应商测试"), result.message, result.status);
  };

  const diagnoseRelayProfile = async (profile: RelayProfileView) => {
    const result = await run(() => managerActions.relay.diagnoseProfile(profile));
    if (result) showNotice("Provider Doctor", result.message, result.status);
    return result ?? null;
  };

  const fetchRelayProfileModels = async (profile: RelayProfileView) => {
    const result = await run(() => managerActions.relay.fetchModels(profile));
    if (result) showNotice(t("模型列表"), result.message, result.status);
    return result && isSuccessStatus(result.status) ? result.models : null;
  };

  const switchOfficialMode = async () => {
    const switched = await clearRelayInjection(true);
    if (!switched) return;
    showNotice(t("官方登录模式"), t("已切回官方登录。"), "ok");
  };

  const switchPureApiMode = async () => {
    const switched = await applyPureApiInjection(true);
    if (!switched) return;
    showNotice(t("纯 API 模式"), t("已切换到纯 API。"), "ok");
  };

  const switchRelayProfile = async (next: BackendSettings, targetRelayId: string) => {
    if (relaySwitching) {
      showNotice(t("供应商切换中"), t("上一次切换还没有完成，请稍后再试。"), "failed");
      return;
    }
    const switchSettings = normalizeSettings({ ...next, activeRelayId: targetRelayId });
    if (!switchSettings.relayProfilesEnabled) {
      showNotice(t("供应商配置已关闭"), t("当前不会写入 Codex config.toml / auth.json。打开供应商配置总开关后再切换。"), "failed");
      return;
    }
    const targetProfile = activeRelayProfile(switchSettings);
    logDiagnostic("switchRelayProfile.start", {
      currentRelayId: settingsForm.activeRelayId,
      targetRelayId: switchSettings.activeRelayId,
      targetRelayName: targetProfile.name,
      targetRelayMode: targetProfile.relayMode,
    });
    const selectedBeforeSave = activeRelayProfile(switchSettings);
    const validationError = relaySwitchIssue(
      switchSettings,
      readContextCatalog(switchSettings).defaultSelection,
      selectedBeforeSave.id,
    );
    if (validationError) {
      logDiagnostic("switchRelayProfile.validation_failed", {
        targetRelayId: selectedBeforeSave.id,
        targetRelayName: selectedBeforeSave.name,
        error: validationError,
      });
      showNotice(t("供应商配置可能不正确"), validationError, "failed");
      return;
    }
    const selectedAfterSave = activeRelayProfile(switchSettings);

    logDiagnostic("switchRelayProfile.apply_start", {
      targetRelayId: selectedAfterSave.id,
      targetRelayName: selectedAfterSave.name,
    });
    setRelaySwitching(true);
    try {
      const result = await run(() =>
        managerActions.relay.switchProfile({ settings: switchSettings, targetRelayId }),
      );
      if (!result) {
        logDiagnostic("switchRelayProfile.apply_no_result", {
          targetRelayId: selectedAfterSave.id,
        });
        return;
      }
      const selectedSettings = normalizeSettings(result.settings);
      setSettings({
        status: result.status,
        message: result.message,
        settings: selectedSettings,
        settingsPath: result.settingsPath,
      });
      setSettingsForm(selectedSettings);
      setRelay({
        status: result.status,
        message: result.message,
        ...result.relay,
      });
      await refreshRelayFiles(true);
      if (!isSuccessStatus(result.status)) {
        logDiagnostic("switchRelayProfile.apply_failed", {
          targetRelayId: selectedAfterSave.id,
          status: result.status,
          message: result.message,
          activeRelayId: selectedSettings.activeRelayId,
        });
        showNotice(t("供应商切换"), result.message, result.status);
        return;
      }
      const currentSelected = activeRelayProfile(selectedSettings);
      logDiagnostic("switchRelayProfile.ok", {
        targetRelayId: currentSelected.id,
        status: result.status,
      });
      showNotice(t("供应商切换"), relayProfileSwitchMessage(currentSelected), result.status);
    } finally {
      setRelaySwitching(false);
    }
  };

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      showNotice(t("复制失败"), stringifyError(error), "failed");
    }
  };

  const openExternalUrl = async (url: string) => {
    const result = await run(() => managerActions.app.openExternalUrl(url));
    if (result) {
      showResultNotice(t("打开链接"), result, { silentSuccess: true });
    }
  };

  const showNotice = (title: string, message: string, status?: Status) => {
    setNotice({ title, message: t(message), status });
  };

  const exitManagerApp = async () => {
    await managerActions.app.exit();
  };

  const hideManagerToTray = async () => {
    await managerActions.app.hideToTray();
  };

  const showResultNotice = (
    title: string,
    result: Pick<CommandResult<unknown>, "message" | "status">,
    options: { silentSuccess?: boolean } = {},
  ) => {
    if (options.silentSuccess && isSuccessStatus(result.status)) return;
    showNotice(title, result.message, result.status);
  };

  useEffect(() => {
    void (async () => {
      const startup = await run(() => managerActions.app.startup());
      if (startup?.showUpdate) {
        setRoute("about");
        void checkUpdate(false);
      } else {
        void checkUpdate(true);
      }
      await refreshOverview(true);
      await refreshSettings(true);
      await refreshRelay(true);
      await refreshEnvConflicts(true);
      await refreshProviderSyncTargets(true);
      await refreshPendingProviderImport(true);
      await refreshRemotePluginMarketplace(true);
      await refreshPluginInventory(true);
    })();
  }, []);

  useEffect(() => {
    if (getLanguage() === "en") {
      void managerActions.app.updateTrayLabels({
        showLabel: "Show window",
        quitLabel: "Quit",
        windowTitle: "ChatGPT++",
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshPendingProviderImport(true);
    }, 1200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem("chatgpt-plus-theme", theme);
  }, [theme]);

  const saveCodexAppPath = async (appPath: string) => {
    const next = { ...settingsForm, codexAppPath: appPath };
    const result = await run(() => managerActions.settings.save(next));
    if (result) {
      setSettings(result);
      const normalized = normalizeSettings(result.settings);
      setSettingsForm(normalized);
      setLaunchForm((current) => ({ ...current, appPath: normalized.codexAppPath }));
      await refreshOverview(true);
    }
    return result;
  };

  const contextMutationPortsRef = useRef<
    ContextMutationPorts<BackendSettings, SettingsResult, LiveContextEntriesResult> | null
  >(null);
  contextMutationPortsRef.current = {
    upsert: requestContextUpsert,
    delete: requestContextDelete,
    persist: async (next) => {
      const normalized = normalizeSettings(next);
      const result = await run(() => managerActions.settings.save(normalized));
      if (!result) return null;
      return { ...result, settings: normalizeSettings(result.settings) };
    },
    commitPersisted: (result) => setSettings(result),
    syncLive: requestContextLiveSync,
    commitLive: (result) => setLiveContextEntries(result.entries),
    refreshRelayFiles: async () => {
      await refreshRelayFiles();
    },
    reportFailure: (result) => {
      if (result.message)
        showNotice(t("工具与插件"), result.message, result.status as Status);
    },
  };
  const contextMutationControllerRef = useRef<ContextMutationController<BackendSettings> | null>(null);
  if (!contextMutationControllerRef.current) {
    type Ports = ContextMutationPorts<BackendSettings, SettingsResult, LiveContextEntriesResult>;
    const ports = <Key extends keyof Ports>(
      key: Key,
    ): Ports[Key] => contextMutationPortsRef.current![key];
    contextMutationControllerRef.current = createContextMutationController({
      upsert: (...args) => ports("upsert")(...args),
      delete: (...args) => ports("delete")(...args),
      persist: (...args) => ports("persist")(...args),
      commitPersisted: (...args) => ports("commitPersisted")(...args),
      syncLive: (...args) => ports("syncLive")(...args),
      commitLive: (...args) => ports("commitLive")(...args),
      refreshRelayFiles: (...args) => ports("refreshRelayFiles")(...args),
      reportFailure: (...args) => ports("reportFailure")(...args),
    });
  }
  const applyContextChange = contextMutationControllerRef.current.apply;

  const actions = useMemo(
    () => ({
      refreshCurrent: () => navigate(route),
      launch,
      restart,
      repairPluginMarketplace,
      refreshRemotePluginMarketplace,
      repairRemotePluginMarketplace,
      installEntrypoints,
      uninstallEntrypoints,
      repairShortcuts,
      checkUpdate,
      performUpdate,
      saveSettings,
      saveSettingsValue,
      refreshSettings,
      resetSettings,
      chooseCodexAppPath: async (mode: "folder" | "file") => {
        let selected: unknown;
        try {
          selected = await open(
            mode === "folder"
              ? { directory: true, multiple: false, title: t("选择 Codex 应用目录") }
              : {
                  directory: false,
                  multiple: false,
                  title: t("选择 Codex.exe 或 Codex.app"),
                  filters: [{ name: t("Codex 应用"), extensions: ["exe", "app"] }],
                },
          );
        } catch (error) {
          // Surface plugin failures (e.g. missing capability permission) so the
          // buttons no longer appear unresponsive — see #345.
          const message = error instanceof Error ? error.message : String(error);
          showNotice(t("Codex 应用路径"), tf("打开选择器失败：{0}", [message]), "failed");
          return;
        }
        if (typeof selected === "string" && selected.trim()) {
          const result = await saveCodexAppPath(selected.trim());
          if (result) {
            showNotice(t("Codex 应用路径"), t("应用路径已保存，之后启动会自动复用。"), result.status);
          }
        }
      },
      clearCodexAppPath: async () => {
        const next = { ...settingsForm, codexAppPath: "" };
        const result = await run(() => managerActions.settings.save(next));
        if (result) {
          setSettings(result);
          setSettingsForm(normalizeSettings(result.settings));
          setLaunchForm((current) => ({ ...current, appPath: "" }));
          showNotice(t("Codex 应用路径"), t("已清除保存路径，后续启动会回到自动探测。"), result.status);
          await refreshOverview(true);
        }
      },
      saveManualCodexAppPath: async () => {
        const appPath = launchForm.appPath.trim();
        if (!appPath) {
          showNotice(t("Codex 应用路径"), t("请先填写或选择应用路径。"), "failed");
          return;
        }
        const result = await saveCodexAppPath(appPath);
        if (result) {
          showNotice(t("Codex 应用路径"), t("应用路径已保存，之后启动会自动复用。"), result.status);
        }
      },
      syncProvidersNow,
      refreshProviderSyncTargets,
      setProviderSyncTarget: (provider: string) => {
        setSelectedProviderSyncTarget(provider);
        setSettingsForm((current) => ({ ...current, providerSyncLastSelectedProvider: provider }));
      },
      refreshRelay,
      refreshRelayFiles,
      refreshEnvConflicts,
      removeEnvConflicts,
      refreshCcsProviders,
      importCcsProviders,
      refreshLiveContextEntries,
      openExternalUrl,
      applyRelayInjection,
      applyPureApiInjection,
      clearRelayInjection,
      saveRelayFile,
      applyContextChange,
      extractRelayCommonConfig,
      testRelayProfile,
      diagnoseRelayProfile,
      fetchRelayProfileModels,
      switchRelayProfile,
      relaySwitching,
      switchOfficialMode,
      switchPureApiMode,
      refreshLogs,
      refreshDiagnostics,
      showMessage: async (title: string, message: string, status?: Status) => showNotice(title, message, status),
      copyLogs: () => copyText(logs?.text ?? "", t("日志已复制。")),
      copyDiagnostics: () => copyText(diagnostics?.report ?? "", t("诊断报告已复制。")),
      goLogs: () => navigate("about"),
      checkHealth: async () => {
        await refreshOverview(true);
        await refreshRelay(true);
        await refreshWatcher(true);
        showNotice(t("检查完成"), t("已刷新 Codex 应用、入口和 Watcher 状态。"), "ok");
      },
      installWatcher: () => watcherAction("install"),
      uninstallWatcher: () => watcherAction("uninstall"),
      enableWatcher: () => watcherAction("enable"),
      disableWatcher: () => watcherAction("disable"),
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [route, launchForm, settingsForm, settings, removeOwnedData, update, updateInstallProgress.active, logs, diagnostics, theme, relayFiles, selectedProviderSyncTarget, envConflicts, ccsProviders, relaySwitching],
  );
  const overviewActions: OverviewActions = {
    checkHealth: actions.checkHealth,
    repairPluginMarketplace: actions.repairPluginMarketplace,
    launch: actions.launch,
    goAbout: actions.goLogs,
  };
  const sessionsView: SessionsView = {
    ...sessionsControllerView,
    providerSync: {
      active: providerSyncProgress.active,
      percent: providerSyncProgress.percent,
      message: providerSyncProgress.message,
      enabled: settingsForm.providerSyncEnabled,
      selectedTarget: selectedProviderSyncTarget,
      targets: (providerSyncTargets?.targets ?? []).map((target) => ({
        id: target.id,
        sources: target.sources,
        isCurrentProvider: target.isCurrentProvider,
      })),
    },
  };
  const sessionsActions: SessionsActions = {
    refreshSessions: () => executeSessionsAction({ type: "refresh" }),
    toggleSessionSelection: (sessionId, selected) =>
      executeSessionsAction({ type: "toggleSelection", sessionId, selected }),
    selectAllSessions: () => executeSessionsAction({ type: "selectAll" }),
    clearSessionSelection: () => executeSessionsAction({ type: "clearSelection" }),
    deleteSelectedSessions: () => executeSessionsAction({ type: "deleteSelection" }),
    deleteSession: (sessionId) => executeSessionsAction({ type: "deleteOne", sessionId }),
    exportSession: (sessionId) => executeSessionsAction({ type: "export", sessionId }),
    loadSessionUsage: (sessionId) => executeSessionsAction({ type: "loadUsage", sessionId }),
    closeSessionDetail: () => executeSessionsAction({ type: "closeDetail" }),
    syncProvidersNow: actions.syncProvidersNow,
    selectProviderSyncTarget: actions.setProviderSyncTarget,
    setProviderSyncEnabled: (enabled) =>
      setSettingsForm((current) => ({ ...current, providerSyncEnabled: enabled })),
    saveProviderSyncSettings: actions.saveSettings,
  };
  const enhanceView: EnhanceView = {
    settings: {
      computerUseGuardEnabled: settingsForm.computerUseGuardEnabled,
      codexAppFastStartup: settingsForm.codexAppFastStartup,
    },
    pluginMarketplaceProgress,
    remotePluginMarketplace: remotePluginMarketplace
      ? {
          marketplaceRoot: remotePluginMarketplace.marketplaceRoot ?? null,
          configRegistered: remotePluginMarketplace.configRegistered,
          pluginCount: remotePluginMarketplace.pluginCount,
          skillCount: remotePluginMarketplace.skillCount,
        }
      : null,
    remotePluginMarketplaceProgress,
    pluginInventory,
    pluginInventoryPending,
  };
  const enhanceActions: EnhanceActions = {
    updateFlag: (key, value) => setSettingsForm((current) => ({ ...current, [key]: value })),
    repairPluginMarketplace: actions.repairPluginMarketplace,
    refreshRemotePluginMarketplaceStatus: async () => {
      await actions.refreshRemotePluginMarketplace();
    },
    repairRemotePluginMarketplace: actions.repairRemotePluginMarketplace,
    refreshPluginInventory: async () => { await refreshPluginInventory(); },
    mutatePlugin,
    registerPluginMarketplace,
    upgradePluginMarketplace,
    upgradeRemotePluginMarketplace,
    saveSettings: actions.saveSettings,
  };
  const maintenanceView: MaintenanceView = {
    codexApp: {
      status: overview?.codexApp.status,
      path: overview?.codexApp.path,
    },
    appShortcut: {
      status: overview?.appShortcut.status,
      path: overview?.appShortcut.path,
    },
    watcher: {
      status: watcher?.enabled ? "ok" : "disabled",
      path: watcher?.disabledFlag,
    },
    savedCodexAppPath: settings?.settings.codexAppPath ?? "",
    launchForm,
    removeOwnedData,
  };
  const maintenanceActions: MaintenanceActions = {
    updateLaunchForm: setLaunchForm,
    setRemoveOwnedData,
    checkHealth: actions.checkHealth,
    repairShortcuts: actions.repairShortcuts,
    installEntrypoints: actions.installEntrypoints,
    uninstallEntrypoints: actions.uninstallEntrypoints,
    installWatcher: actions.installWatcher,
    uninstallWatcher: actions.uninstallWatcher,
    enableWatcher: actions.enableWatcher,
    disableWatcher: actions.disableWatcher,
    chooseCodexAppPath: actions.chooseCodexAppPath,
    clearCodexAppPath: actions.clearCodexAppPath,
    launch: actions.launch,
    saveManualCodexAppPath: actions.saveManualCodexAppPath,
  };
  const hasUpdate = update?.updateAvailable === true;

  return (
    <div className={`shell ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-copy">
            <div className="brand-title-row">
              <div className="brand-title">ChatGPT++</div>
              {hasUpdate ? (
                <button
                  className="update-dot"
                  onClick={() => {
                    setRoute("about");
                    void checkUpdate(false);
                  }}
                  title={tf("发现新版本 {0}", [update?.latestVersion ?? ""])}
                  type="button"
                >
                  <CircleArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="brand-subtitle">{t("管理控制台")}</div>
          </div>
        </div>
        <nav className="nav">
          {navigationRoutes.map((item) => {
            const Icon = item.icon;
            return (
            <button
              className={`nav-item ${route === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => void navigate(item.id)}
              title={item.label}
              type="button"
            >
              <span className="nav-icon">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="nav-label">{item.label}</span>
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </button>
          );
          })}
        </nav>
      </aside>
      <main className="workspace">
        <header className="topbar" key={`topbar-${route}`}>
          <div>
            <h1>{routeTitle(route)}</h1>
            <p>{routeSubtitle(route)}</p>
          </div>
          <div className="topbar-actions">
            <Button
              onClick={() => toggleLanguage()}
              size="icon"
              title={getLanguage() === "en" ? t("切换到中文") : t("切换到英文")}
              variant="outline"
            >
              <Languages className="h-4 w-4" />
            </Button>
            <Button
              onClick={actions.toggleTheme}
              size="icon"
              title={theme === "dark" ? t("切换到浅色") : t("切换到深色")}
              variant="outline"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button onClick={() => void actions.restart()} title={t("重启 ChatGPT++")} variant="outline">
              <Rocket className="h-4 w-4" />
              {t("重启 ChatGPT++")}
            </Button>
            <Button onClick={() => void actions.refreshCurrent()} size="icon" title={t("刷新当前页面")} variant="outline">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <section className="screen" key={route}>
          {route === "overview" ? (
            <OverviewScreen
              overview={overview}
              pluginMarketplaceProgress={pluginMarketplaceProgress}
              actions={overviewActions}
            />
          ) : null}
          {route === "relay" ? (
            <RelayProfilesScreen
              relayFiles={relayFiles}
              envConflicts={envConflicts}
              ccsProviders={ccsProviders}
              form={normalizeSettings(settingsForm)}
              contextEntries={readContextCatalog(normalizeSettings(settingsForm)).entries}
              defaultContextSelection={readContextCatalog(normalizeSettings(settingsForm)).defaultSelection}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}
          {route === "sessions" ? (
            <SessionsScreen
              view={sessionsView}
              actions={sessionsActions}
            />
          ) : null}
          {route === "context" ? (
            <ContextScreen
              form={normalizeSettings(settingsForm)}
              liveEntries={liveContextEntries}
              onFormChange={setSettingsForm}
              actions={actions}
            />
          ) : null}
          {route === "enhance" ? (
            <EnhanceScreen
              view={enhanceView}
              actions={enhanceActions}
            />
          ) : null}
          {route === "maintenance" ? (
            <MaintenanceScreen view={maintenanceView} actions={maintenanceActions} />
          ) : null}
          {route === "about" ? (
            <AboutScreen
              overview={overview}
              update={update}
              updateInstallProgress={updateInstallProgress}
              logs={logs}
              diagnostics={diagnostics}
              actions={actions}
            />
          ) : null}
          {route === "settings" ? (
            <SettingsScreen
              settingsPath={settings?.settingsPath ?? ""}
              theme={theme}
              form={settingsForm}
              onFormChange={(form) => setSettingsForm((current) => ({ ...current, ...form }))}
              actions={actions}
            />
          ) : null}
        </section>
      </main>
      {notice ? (
        <NoticeDialog
          key={`${notice.title}-${notice.message}-${notice.status ?? ""}`}
          notice={notice}
          onClose={() => setNotice(null)}
        />
      ) : null}
      {confirmDialog ? (
        <ConfirmDialog
          confirm={confirmDialog}
          onCancel={() => {
            confirmDialog.resolve(false);
            setConfirmDialog(null);
          }}
          onConfirm={() => {
            confirmDialog.resolve(true);
            setConfirmDialog(null);
          }}
        />
      ) : null}
      {pendingProviderImport ? (
        <PendingProviderImportDialog
          view={projectPendingProviderImport(pendingProviderImport)}
          onConfirm={() => void confirmPendingProviderImport()}
          onDismiss={() => void dismissPendingProviderImport()}
        />
      ) : null}
    </div>
  );
}

type Actions = {
  refreshCurrent: () => Promise<void>;
  launch: () => Promise<void>;
  restart: () => Promise<void>;
  repairPluginMarketplace: () => Promise<void>;
  refreshRemotePluginMarketplace: (silent?: boolean) => Promise<RemotePluginMarketplaceResult | null>;
  repairRemotePluginMarketplace: () => Promise<void>;
  installEntrypoints: () => Promise<void>;
  uninstallEntrypoints: () => Promise<void>;
  repairShortcuts: () => Promise<void>;
  checkUpdate: () => Promise<void>;
  performUpdate: () => Promise<void>;
  saveSettings: () => Promise<void>;
  saveSettingsValue: (settings: BackendSettings, silent?: boolean) => Promise<void>;
  refreshSettings: (silent?: boolean) => Promise<BackendSettings | null>;
  resetSettings: () => Promise<void>;
  chooseCodexAppPath: (mode: "folder" | "file") => Promise<void>;
  clearCodexAppPath: () => Promise<void>;
  saveManualCodexAppPath: () => Promise<void>;
  syncProvidersNow: () => Promise<void>;
  refreshProviderSyncTargets: (silent?: boolean) => Promise<ProviderSyncTargetsResult | null>;
  setProviderSyncTarget: (provider: string) => void;
  refreshRelay: () => Promise<void>;
  refreshRelayFiles: () => Promise<RelayFilesResult | null>;
  refreshEnvConflicts: (silent?: boolean) => Promise<EnvConflictsResult | null>;
  removeEnvConflicts: (names: string[]) => Promise<void>;
  refreshCcsProviders: (silent?: boolean) => Promise<CcsProvidersResult | null>;
  importCcsProviders: () => Promise<void>;
  refreshLiveContextEntries: () => Promise<LiveContextEntriesResult | null>;
  openExternalUrl: (url: string) => Promise<void>;
  applyRelayInjection: () => Promise<boolean>;
  applyPureApiInjection: () => Promise<boolean>;
  clearRelayInjection: () => Promise<boolean>;
  saveRelayFile: (kind: "config" | "auth", contents: string, silent?: boolean) => Promise<void>;
  applyContextChange: ContextMutationController<BackendSettings>["apply"];
  extractRelayCommonConfig: (configContents: string) => Promise<ExtractRelayCommonConfigResult | null>;
  testRelayProfile: (profile: RelayProfileView) => Promise<void>;
  diagnoseRelayProfile: (profile: RelayProfileView) => Promise<ProviderDoctorResult | null>;
  fetchRelayProfileModels: (profile: RelayProfileView) => Promise<string[] | null>;
  switchRelayProfile: (settings: BackendSettings, targetRelayId: string) => Promise<void>;
  relaySwitching: boolean;
  switchOfficialMode: () => Promise<void>;
  switchPureApiMode: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  showMessage: (title: string, message: string, status?: Status) => Promise<void>;
  copyLogs: () => Promise<void>;
  copyDiagnostics: () => Promise<void>;
  goLogs: () => Promise<void>;
  installWatcher: () => Promise<void>;
  uninstallWatcher: () => Promise<void>;
  enableWatcher: () => Promise<void>;
  disableWatcher: () => Promise<void>;
  toggleTheme: () => void;
  checkHealth: () => Promise<void>;
};
