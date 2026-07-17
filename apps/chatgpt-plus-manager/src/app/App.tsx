import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  CircleArrowUp,
  Languages,
  Moon,
  Plus,
  RefreshCw,
  Rocket,
  Sun,
} from "lucide-react";
import { RelayProfilesScreen } from "@/screens/relay-profiles/RelayProfilesScreen";
import { OverviewHealthIndicators } from "@/screens/overview/OverviewHealthIndicators";
import { detectLaunchCrash } from "@/screens/overview/presentation";
import { AboutScreen } from "@/screens/diagnostics/AboutScreen";
import { EnhanceScreen } from "@/screens/enhance/EnhanceScreen";
import type { EnhanceActions, EnhanceView } from "@/screens/enhance/EnhanceScreen";
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
import type { UpdateResult } from "@/shared/contracts/diagnostics";
import type { OverviewResult } from "@/shared/contracts/overview";
import type { PluginMarketplaceInventoryResult } from "@/shared/contracts/plugins";
import type { LocalSession } from "@/shared/contracts/sessions";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type {
  BackendSettings,
  CcsProvidersResult,
  CommandResult,
  EnvConflictsResult,
  ExtractRelayCommonConfigResult,
  ProviderDoctorResult,
  PreferenceSettings,
  RelayFilesResult,
  RelayProfileView,
  SettingsResult,
  Status,
} from "@/app/contracts";
import {
  managerActions,
  type ProviderImportRequest,
  type ProviderSyncPayload,
  type RelayResult,
  type RemotePluginMarketplaceResult,
} from "@/app/actions";
import {
  ConfirmDialog,
  NoticeDialog,
} from "@/app/components/ApplicationDialogs";
import {
  isSuccessStatus,
  loadInitialTheme,
  getNavigationRoutes,
  stringifyError,
  type Theme,
} from "@/app/presentation";
import {
  loadInitialRoute,
  nextRelayListRequest,
  type Route,
} from "@/app/routes";
import {
  activeRelayProfile,
  defaultSettings,
  normalizeSettings,
} from "@/app/settings-normalization";
import { copyLatestDiagnosticReport } from "@/app/diagnostics-copy";
import { writeTextToClipboard } from "@/app/clipboard";
import { createSettingsAutosave } from "@/app/settings-autosave";
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
import { t, tf, toggleLanguage, useLanguage } from "@/i18n";
import {
  truncateSessionDeletePreview,
} from "@/features/sessions/presentation";

const PROTOCOL_PROXY_BASE_URL = "http://127.0.0.1:57321/v1";
const CHAT_UPSTREAM_BASE_URL_KEY = "chatgpt_plus_chat_base_url";
const WEEKLY_UPDATE_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTOMATIC_UPDATE_CHECKS_ENABLED = import.meta.env.PROD;
const DEVELOPMENT_RUNTIME =
  typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

type SettingsSaveRequest =
  | { mode: "autosave"; form: PreferenceSettings }
  | { mode: "manual"; settings: BackendSettings };

export function App() {
  const language = useLanguage();
  const [theme, setTheme] = useState<Theme>(() => loadInitialTheme());
  const [route, setRoute] = useState<Route>(() =>
    loadInitialRoute(typeof window === "undefined" ? undefined : window.location),
  );
  const [relayNavbarActionHost, setRelayNavbarActionHost] = useState<HTMLDivElement | null>(null);
  const [relayCreateRequest, setRelayCreateRequest] = useState(0);
  const [relayListRequest, setRelayListRequest] = useState(0);
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
  const [update, setUpdate] = useState<UpdateResult | null>(null);
  const [updateInstallProgress, setUpdateInstallProgress] = useState<TaskProgress>({
    active: false,
    percent: 0,
    message: t("尚未运行安装包更新。"),
  });
  const prevLaunchStatusRef = useRef<string | null>(null);
  const [settingsForm, setSettingsForm] = useState<BackendSettings>({ ...defaultSettings });
  const settingsAutosaveRef = useRef<{
    schedule: (request: SettingsSaveRequest) => void;
    saveNow: (request: SettingsSaveRequest) => void;
    dispose: () => void;
  } | null>(null);
  const [providerSyncActive, setProviderSyncActive] = useState(false);
  const [pluginMarketplacePending, setPluginMarketplacePending] = useState(false);
  const [remotePluginMarketplace, setRemotePluginMarketplace] = useState<RemotePluginMarketplaceResult | null>(null);
  const [remotePluginMarketplacePending, setRemotePluginMarketplacePending] = useState(false);
  const [pluginInventory, setPluginInventory] = useState<PluginMarketplaceInventoryResult | null>(null);
  const [pluginInventoryPending, setPluginInventoryPending] = useState<string | null>(null);
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

  const refreshSettingsPage = async () => {
    await Promise.all([
      refreshSettings(true),
      refreshOverview(true),
    ]);
  };

  const scrollToSettingsSection = (sectionId: string) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(sectionId)?.scrollIntoView({ block: "start" });
      });
    });
  };

  const navigate = async (next: Route) => {
    if (route === "sessions" && next !== "sessions") {
      sessionsControllerRef.current!.reset();
    }
    setRelayListRequest((current) => nextRelayListRequest(next, current));
    setRoute(next);
    if (next === "relay") {
      await refreshSettings(true);
      await refreshRelay(true);
      await refreshRelayFiles(true);
      await refreshEnvConflicts(true);
      await refreshCcsProviders(true);
    }
    if (next === "sessions") {
      await Promise.all([
        refreshSettings(true),
        refreshLocalSessions(true),
      ]);
    }
    if (next === "enhance") {
      await refreshSettings(true);
      await refreshRemotePluginMarketplace(true);
      await refreshPluginInventory(true);
    }
    if (next === "settings") await refreshSettingsPage();
  };

  const openProviderCreator = async () => {
    if (route !== "relay") await navigate("relay");
    setRelayCreateRequest((current) => current + 1);
  };

  const openSettingsPage = async (sectionId?: string) => {
    setRoute("settings");
    await refreshSettingsPage();
    if (sectionId) scrollToSettingsSection(sectionId);
  };

  const launch = async () => {
    logDiagnostic("manager.ui.launch.click", {
      appPath: settingsForm.codexAppPath,
    });
    const result = await launchCommand("launch");
    if (result) {
      logDiagnostic("manager.ui.launch.result", {
        status: result.status,
        message: result.message,
      });
      showNotice(t("启动任务"), result.message, result.status);
      await refreshOverview(true);
    }
  };

  const launchCommand = async (intent: "launch" | "restart") => {
    const request = {
      appPath: settingsForm.codexAppPath,
    };
    const result = await run(() => managerActions.overview[intent](request));
    return result;
  };

  const repairPluginMarketplace = async () => {
    if (pluginMarketplacePending) return;
    setPluginMarketplacePending(true);
    try {
      const result = await run(() => managerActions.maintenance.repairPluginMarketplace());
      if (result) {
        showNotice(t("官方插件市场"), result.message, result.status);
      }
    } finally {
      setPluginMarketplacePending(false);
    }
  };

  const refreshRemotePluginMarketplace = async (silent = false) => {
    const result = await run(() => managerActions.maintenance.remotePluginMarketplaceStatus());
    if (result) {
      setRemotePluginMarketplace(result);
      if (!silent) showNotice(t("内置备用插件市场"), result.message, result.status);
    }
    return result;
  };

  const repairRemotePluginMarketplace = async () => {
    if (remotePluginMarketplacePending) return;
    setRemotePluginMarketplacePending(true);
    try {
      const result = await run(() => managerActions.maintenance.repairRemotePluginMarketplace());
      if (result) {
        setRemotePluginMarketplace(result);
        showNotice(t("内置备用插件市场"), result.message, result.status);
      }
    } finally {
      setRemotePluginMarketplacePending(false);
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
    const profileMutation = normalized.relayProfiles.length > settingsForm.relayProfiles.length
      ? "created"
      : normalized.relayProfiles.length < settingsForm.relayProfiles.length
        ? "deleted"
        : null;
    setSettingsForm(normalized);
    const result = await run(() => managerActions.settings.save(normalized));
    if (result) {
      setSettings(result);
      setSettingsForm(normalizeSettings(result.settings));
      if (isSuccessStatus(result.status) && profileMutation) {
        showNotice(
          t("供应商配置"),
          profileMutation === "created" ? t("供应商配置已创建。") : t("供应商配置已删除。"),
          result.status,
        );
      } else if (!silent || !isSuccessStatus(result.status)) {
        showNotice(t("设置保存"), result.message, result.status);
      }
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

  const syncProvidersNow = async () => {
    if (providerSyncActive) return;
    setProviderSyncActive(true);
    try {
      const result = await run(() => managerActions.sessions.syncProviders());
      if (result) {
        showNotice(t("历史会话修复"), result.message, result.status);
      } else {
        showNotice(t("历史会话修复"), t("历史会话修复失败，请查看错误提示后重试。"), "failed");
      }
    } finally {
      setProviderSyncActive(false);
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
      { mcpServers: [], skills: [], plugins: [] },
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
      showNotice(
        t("供应商切换"),
        `${relayProfileSwitchMessage(currentSelected)} ${t(result.message)}`,
        result.status,
      );
    } finally {
      setRelaySwitching(false);
    }
  };

  const copyDiagnostics = async () => {
    const result = await copyLatestDiagnosticReport({
      generate: () => managerActions.diagnostics.copy(),
      writeClipboard: writeTextToClipboard,
    });
    if (result.status === "ok") {
      showNotice(
        t("复制诊断报告"),
        t("诊断报告已复制，现在可以前往反馈问题并粘贴到 Issue。"),
        "ok",
      );
      return;
    }

    showNotice(
      t("复制诊断报告"),
      result.stage === "generate"
        ? tf("生成诊断报告失败：{0}", [stringifyError(result.error)])
        : tf("复制诊断报告失败：{0}", [stringifyError(result.error)]),
      "failed",
    );
  };

  const openExternalUrl = async (url: string) => {
    const result = await run(() => managerActions.app.openExternalUrl(url));
    if (result) {
      showResultNotice(t("打开链接"), result, { silentSuccess: true });
    }
  };

  const openLogFolder = async () => {
    const result = await run(() => managerActions.diagnostics.openLogFolder());
    if (result) {
      showResultNotice(t("日志文件夹"), result, { silentSuccess: true });
    }
  };

  const showNotice = (title: string, message: string, status?: Status) => {
    setNotice({ title, message: t(message), status });
  };

  if (!settingsAutosaveRef.current) {
    settingsAutosaveRef.current = createSettingsAutosave<SettingsSaveRequest, SettingsResult>({
      save: async (request) => {
        const result = request.mode === "manual"
          ? await managerActions.settings.save(request.settings)
          : await managerActions.settings.savePreferences(request.form);
        if (!isSuccessStatus(result.status)) throw new Error(result.message);
        return result;
      },
      onSaved: (result, requested) => {
        const requestedForm = requested.mode === "manual" ? requested.settings : requested.form;
        setSettings(result);
        const normalized = normalizeSettings(result.settings);
        setSettingsForm((current) => {
          const stillCurrent =
            current.diagnosticLogEnabled === requestedForm.diagnosticLogEnabled
            && current.codexExtraArgs.length === requestedForm.codexExtraArgs.length
            && current.codexExtraArgs.every((arg, index) => arg === requestedForm.codexExtraArgs[index]);
          if (!stillCurrent) return current;
          return {
            ...current,
            codexExtraArgs: normalized.codexExtraArgs,
            diagnosticLogEnabled: normalized.diagnosticLogEnabled,
          };
        });
        if (requested.mode === "autosave") showNotice(t("设置保存"), result.message, result.status);
      },
      onError: (error, requested) => {
        showNotice(
          requested.mode === "autosave" ? t("设置自动保存") : t("设置保存"),
          stringifyError(error),
          "failed",
        );
      },
      onStateChange: () => {},
    });
  }

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

  useEffect(() => () => settingsAutosaveRef.current?.dispose(), []);

  useEffect(() => {
    void (async () => {
      const startup = await run(() => managerActions.app.startup());
      if (startup?.showUpdate) {
        setRoute("settings");
        scrollToSettingsSection("settings-about");
        if (AUTOMATIC_UPDATE_CHECKS_ENABLED) {
          void checkUpdate(false);
        }
      } else if (AUTOMATIC_UPDATE_CHECKS_ENABLED) {
        void checkUpdate(true);
      }
      await refreshOverview(true);
      await refreshSettings(true);
      await refreshRelay(true);
      await refreshEnvConflicts(true);
      await refreshPendingProviderImport(true);
      await refreshRemotePluginMarketplace(true);
      await refreshPluginInventory(true);
    })();
  }, []);

  useEffect(() => {
    if (!AUTOMATIC_UPDATE_CHECKS_ENABLED) return;
    const timer = window.setInterval(() => {
      void checkUpdate(true);
    }, WEEKLY_UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void managerActions.app.updateTrayLabels({
      showLabel: language === "en" ? "Show window" : t("显示窗口"),
      quitLabel: language === "en" ? "Quit" : t("退出"),
      windowTitle: "ChatGPT++",
    });
  }, [language]);

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
      await refreshOverview(true);
    }
    return result;
  };

  const actions = useMemo(
    () => ({
      launch,
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
      chooseChatGptAppPath: async () => {
        let selected: unknown;
        try {
          const isWindows =
            typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("windows");
          selected = await open(
            isWindows
              ? {
                  directory: false,
                  multiple: false,
                  title: t("选择 ChatGPT 应用"),
                  filters: [{ name: t("ChatGPT 应用"), extensions: ["exe"] }],
                }
              : {
                  directory: true,
                  multiple: false,
                  title: t("选择 ChatGPT 应用"),
                },
          );
        } catch (error) {
          // Surface plugin failures (e.g. missing capability permission) so the
          // buttons no longer appear unresponsive — see #345.
          const message = error instanceof Error ? error.message : String(error);
          showNotice(t("ChatGPT 路径"), tf("打开选择器失败：{0}", [message]), "failed");
          return;
        }
        if (typeof selected === "string" && selected.trim()) {
          const result = await saveCodexAppPath(selected.trim());
          if (result) {
            showNotice(t("ChatGPT 路径"), t("已选择 ChatGPT 应用，后续启动会自动复用。"), result.status);
          }
        }
      },
      syncProvidersNow,
      refreshRelay,
      refreshRelayFiles,
      refreshEnvConflicts,
      removeEnvConflicts,
      refreshCcsProviders,
      importCcsProviders,
      openExternalUrl,
      openLogFolder,
      setDiagnosticLogEnabled: (enabled: boolean) => {
        const next = normalizeSettings({ ...settingsForm, diagnosticLogEnabled: enabled });
        setSettingsForm(next);
        settingsAutosaveRef.current?.saveNow({
          mode: "manual",
          settings: next,
        });
      },
      setCodexExtraArgs: (codexExtraArgs: string[]) => {
        const next = normalizeSettings({ ...settingsForm, codexExtraArgs });
        setSettingsForm(next);
        settingsAutosaveRef.current?.schedule({
          mode: "autosave",
          form: {
            codexExtraArgs: next.codexExtraArgs,
            diagnosticLogEnabled: next.diagnosticLogEnabled,
          },
        });
      },
      applyRelayInjection,
      applyPureApiInjection,
      clearRelayInjection,
      saveRelayFile,
      extractRelayCommonConfig,
      testRelayProfile,
      diagnoseRelayProfile,
      fetchRelayProfileModels,
      switchRelayProfile,
      relaySwitching,
      switchOfficialMode,
      switchPureApiMode,
      showMessage: async (title: string, message: string, status?: Status) => showNotice(title, message, status),
      copyDiagnostics,
      checkHealth: async () => {
        await refreshOverview(true);
        await refreshRelay(true);
        showNotice(t("检查完成"), t("已刷新 Codex 应用状态。"), "ok");
      },
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [route, settingsForm, settings, removeOwnedData, update, updateInstallProgress.active, theme, relayFiles, envConflicts, ccsProviders, relaySwitching],
  );
  const sessionsView: SessionsView = {
    ...sessionsControllerView,
    providerSync: {
      active: providerSyncActive,
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
  };
  const enhanceView: EnhanceView = {
    settings: {
      computerUseGuardEnabled: settingsForm.computerUseGuardEnabled,
      codexAppFastStartup: settingsForm.codexAppFastStartup,
    },
    pluginMarketplacePending,
    remotePluginMarketplace: remotePluginMarketplace
      ? {
          marketplaceRoot: remotePluginMarketplace.marketplaceRoot ?? null,
          configRegistered: remotePluginMarketplace.configRegistered,
          pluginCount: remotePluginMarketplace.pluginCount,
          skillCount: remotePluginMarketplace.skillCount,
        }
      : null,
    remotePluginMarketplacePending,
    pluginInventory,
    pluginInventoryPending,
  };
  const enhanceActions: EnhanceActions = {
    updateFlag: (key, value) => {
      const next = normalizeSettings({ ...settingsForm, [key]: value });
      setSettingsForm(next);
      settingsAutosaveRef.current?.saveNow({
        mode: "manual",
        settings: next,
      });
    },
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
  };
  const hasUpdate = update?.updateAvailable === true;

  const handleWindowDragMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail !== 1) return;
    event.preventDefault();
    void getCurrentWindow().startDragging().catch((error) => {
      console.error("Failed to start native window dragging", error);
    });
  };

  return (
    <div className={`shell ${theme}`}>
      <div
        aria-hidden="true"
        className="window-drag-region"
        onMouseDown={handleWindowDragMouseDown}
      />
      <main className="workspace">
        <header className="topbar" data-tauri-drag-region key={`topbar-${route}`}>
          <div className="topbar-navigation">
            <div className="brand">
              <div className="brand-title-row">
                <div className="brand-title">
                  ChatGPT++
                  {DEVELOPMENT_RUNTIME ? <span className="development-badge">DEV</span> : null}
                </div>
              </div>
            </div>
            <nav aria-label={t("主导航")} className="nav">
              {getNavigationRoutes().map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    aria-label={item.label}
                    aria-current={route === item.id ? "page" : undefined}
                    className={`nav-item ${route === item.id ? "active" : ""}`}
                    key={item.id}
                    onClick={() => void navigate(item.id)}
                    title={`${item.label} · ${item.subtitle}`}
                    type="button"
                  >
                    <span className="nav-icon">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                );
              })}
              {hasUpdate ? (
                <button
                  aria-label={
                    updateInstallProgress.active
                      ? t("正在更新…")
                      : tf("更新到 {0}", [update?.latestVersion ?? ""])
                  }
                  className="nav-item update-nav-item"
                  disabled={updateInstallProgress.active}
                  onClick={() => void actions.performUpdate()}
                  title={
                    updateInstallProgress.active
                      ? t("正在更新…")
                      : tf("发现新版本 {0}", [update?.latestVersion ?? ""])
                  }
                  type="button"
                >
                  <span className="nav-icon">
                    {updateInstallProgress.active ? (
                      <RefreshCw className="h-4 w-4 update-nav-spinner" aria-hidden="true" />
                    ) : (
                      <CircleArrowUp className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                </button>
              ) : null}
            </nav>
            <div className="topbar-actions">
              <div className="relay-navbar-action" ref={setRelayNavbarActionHost}>
                {route !== "relay" ? (
                  <Button
                    aria-label={t("添加供应商")}
                    className="provider-create-trigger"
                    onClick={() => void openProviderCreator()}
                    size="icon"
                    title={t("添加供应商")}
                    variant="ghost"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              <OverviewHealthIndicators overview={overview} onRefresh={actions.checkHealth} />
              <Button
                aria-label={language === "en" ? t("切换到中文") : t("切换到英文")}
                onClick={() => toggleLanguage()}
                size="icon"
                title={language === "en" ? t("切换到中文") : t("切换到英文")}
                variant="ghost"
              >
                <Languages className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                aria-label={theme === "dark" ? t("切换到浅色") : t("切换到深色")}
                onClick={actions.toggleTheme}
                size="icon"
                title={theme === "dark" ? t("切换到浅色") : t("切换到深色")}
                variant="ghost"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Moon className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
              <Button
                aria-label={t("启动 ChatGPT++")}
                onClick={() => void actions.launch()}
                size="icon"
                title={t("启动 ChatGPT++")}
                variant="ghost"
              >
                <Rocket className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>
        <section className="screen" data-page-shell={route} key={route}>
          {route === "relay" ? (
            <RelayProfilesScreen
              relayFiles={relayFiles}
              envConflicts={envConflicts}
              ccsProviders={ccsProviders}
              form={normalizeSettings(settingsForm)}
              navbarActionHost={relayNavbarActionHost}
              createRequest={relayCreateRequest}
              listRequest={relayListRequest}
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
          {route === "enhance" ? (
            <EnhanceScreen
              view={enhanceView}
              actions={enhanceActions}
            />
          ) : null}
          {route === "settings" ? (
            <div className="settings-page">
              <section className="settings-page-section" id="settings-about">
                <AboutScreen
                  overview={overview}
                  update={update}
                  updateInstallProgress={updateInstallProgress}
                  chatGptAppPath={overview?.codexApp.path ?? settingsForm.codexAppPath}
                  codexExtraArgs={settingsForm.codexExtraArgs}
                  diagnosticLogEnabled={settingsForm.diagnosticLogEnabled}
                  actions={actions}
                />
              </section>
            </div>
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
  launch: () => Promise<void>;
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
  chooseChatGptAppPath: () => Promise<void>;
  syncProvidersNow: () => Promise<void>;
  refreshRelay: () => Promise<void>;
  refreshRelayFiles: () => Promise<RelayFilesResult | null>;
  refreshEnvConflicts: (silent?: boolean) => Promise<EnvConflictsResult | null>;
  removeEnvConflicts: (names: string[]) => Promise<void>;
  refreshCcsProviders: (silent?: boolean) => Promise<CcsProvidersResult | null>;
  importCcsProviders: () => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  openLogFolder: () => Promise<void>;
  setDiagnosticLogEnabled: (enabled: boolean) => void;
  setCodexExtraArgs: (args: string[]) => void;
  applyRelayInjection: () => Promise<boolean>;
  applyPureApiInjection: () => Promise<boolean>;
  clearRelayInjection: () => Promise<boolean>;
  saveRelayFile: (kind: "config" | "auth", contents: string, silent?: boolean) => Promise<void>;
  extractRelayCommonConfig: (configContents: string) => Promise<ExtractRelayCommonConfigResult | null>;
  testRelayProfile: (profile: RelayProfileView) => Promise<void>;
  diagnoseRelayProfile: (profile: RelayProfileView) => Promise<ProviderDoctorResult | null>;
  fetchRelayProfileModels: (profile: RelayProfileView) => Promise<string[] | null>;
  switchRelayProfile: (settings: BackendSettings, targetRelayId: string) => Promise<void>;
  relaySwitching: boolean;
  switchOfficialMode: () => Promise<void>;
  switchPureApiMode: () => Promise<void>;
  showMessage: (title: string, message: string, status?: Status) => Promise<void>;
  copyDiagnostics: () => Promise<void>;
  toggleTheme: () => void;
  checkHealth: () => Promise<void>;
};
