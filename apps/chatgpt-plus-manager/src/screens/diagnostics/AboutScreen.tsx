import {
  ArrowUpCircle,
  ChevronDown,
  ClipboardCopy,
  FolderOpen,
  Github,
  MessageCircleWarning,
  RefreshCw,
  ScrollText,
  SquareTerminal,
} from "lucide-react";

import { Button } from "@/shared/ui/button";
import { t, tf } from "@/i18n";
import type { UpdateResult } from "@/shared/contracts/diagnostics";
import type { OverviewResult } from "@/shared/contracts/overview";
import { SettingsCard } from "@/shared/ui/layout";
import type { TaskProgress } from "@/shared/ui/task-progress";
import { Textarea } from "@/shared/ui/textarea";

import {
  codexExtraArgsToInput,
  inputToCodexExtraArgs,
} from "@/screens/settings/presentation";

import "./about.css";

const appIcon = new URL("../../../src-tauri/icons/icon.png", import.meta.url).href;

export type DiagnosticsActions = {
  openExternalUrl: (url: string) => Promise<void>;
  checkUpdate: () => Promise<void>;
  performUpdate: () => Promise<void>;
  copyDiagnostics: () => Promise<void>;
  openLogFolder: () => Promise<void>;
  setDiagnosticLogEnabled: (enabled: boolean) => void;
  setCodexExtraArgs: (args: string[]) => void;
};

export function AboutScreen({
  overview,
  update,
  updateInstallProgress,
  codexExtraArgs,
  diagnosticLogEnabled,
  actions,
}: {
  overview: OverviewResult | null;
  update: UpdateResult | null;
  updateInstallProgress: TaskProgress;
  codexExtraArgs: string[];
  diagnosticLogEnabled: boolean;
  actions: DiagnosticsActions;
}) {
  const currentVersion = overview?.currentVersion ?? update?.currentVersion ?? "-";
  const latestVersion = update?.latestVersion ?? "";
  const hasUpdate = update?.updateAvailable === true && latestVersion.length > 0;
  const updateMessage = updateInstallProgress.active
    ? updateInstallProgress.message
    : hasUpdate
      ? tf("新版本 {0} 已可用", [latestVersion])
      : update
        ? t(update.message)
        : t("每次启动时自动检查更新，应用持续运行时每周检查一次。");

  return (
    <SettingsCard
      className="about-panel"
      contentClassName="about-panel-content"
      title={t("关于")}
    >
      <div className="about-identity">
        <img alt="" className="about-app-icon" src={appIcon} />
        <div className="about-identity-copy">
          <h2>ChatGPT++</h2>
          <p>{tf("版本 {0}", [currentVersion])}</p>
        </div>
      </div>

      <div className="about-action-list">
        <section className="about-action-row">
          <div className="about-action-icon about-action-icon-update">
            {updateInstallProgress.active ? (
              <RefreshCw aria-hidden="true" className="h-5 w-5 about-update-spinner" />
            ) : (
              <ArrowUpCircle aria-hidden="true" className="h-5 w-5" />
            )}
          </div>
          <div className="about-action-copy">
            <strong>{hasUpdate ? tf("发现新版本 {0}", [latestVersion]) : t("软件更新")}</strong>
            <small>{updateMessage}</small>
            {updateInstallProgress.active ? (
              <span className="about-update-progress" aria-label={tf("更新进度 {0}%", [updateInstallProgress.percent])}>
                <span style={{ width: `${updateInstallProgress.percent}%` }} />
              </span>
            ) : null}
          </div>
          <Button
            disabled={updateInstallProgress.active}
            onClick={() => void (hasUpdate ? actions.performUpdate() : actions.checkUpdate())}
            variant={hasUpdate ? "default" : "secondary"}
          >
            {updateInstallProgress.active
              ? t("正在更新…")
              : hasUpdate
                ? tf("更新到 {0}", [latestVersion])
                : t("检查更新")}
          </Button>
        </section>

        <section className="about-action-row">
          <div className="about-action-icon">
            <ClipboardCopy aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="about-action-copy">
            <strong>{t("诊断报告")}</strong>
            <small>{t("复制当前应用与运行环境信息，便于快速定位问题。")}</small>
          </div>
          <Button onClick={() => void actions.copyDiagnostics()} variant="secondary">
            {t("复制诊断报告")}
          </Button>
        </section>

        <section className="about-action-row">
          <div className="about-action-icon">
            <ScrollText aria-hidden="true" className="h-5 w-5" />
          </div>
          <label className="about-action-copy" htmlFor="diagnostic-log-enabled">
            <strong>{t("日志记录")}</strong>
          </label>
          <div className="about-action-buttons">
            <Button onClick={() => void actions.openLogFolder()} variant="secondary">
              <FolderOpen aria-hidden="true" className="h-4 w-4" />
              {t("打开日志文件夹")}
            </Button>
            <input
              aria-label={t("启用日志记录")}
              checked={diagnosticLogEnabled}
              className="diagnostic-log-switch"
              id="diagnostic-log-enabled"
              onChange={(event) => actions.setDiagnosticLogEnabled(event.currentTarget.checked)}
              type="checkbox"
            />
          </div>
        </section>

        <section className="about-action-row">
          <div className="about-action-icon">
            <MessageCircleWarning aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="about-action-copy">
            <strong>{t("反馈与项目")}</strong>
            <small>{t("提交问题，或前往 GitHub 查看源码与版本发布。")}</small>
          </div>
          <div className="about-action-buttons">
            <Button
              onClick={() => void actions.openExternalUrl("https://github.com/Gzmomo001/chatgpt-plus-plus/issues")}
              variant="secondary"
            >
              {t("反馈问题")}
            </Button>
            <Button
              onClick={() => void actions.openExternalUrl("https://github.com/Gzmomo001/chatgpt-plus-plus")}
              variant="secondary"
            >
              <Github aria-hidden="true" className="h-4 w-4" />
              GitHub
            </Button>
          </div>
        </section>

        <details className="about-advanced">
          <summary className="about-advanced-summary">
            <span className="about-action-icon">
              <SquareTerminal aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="about-action-copy">
              <strong>{t("高级功能")}</strong>
              <small>{t("配置 ChatGPT 的额外启动参数。")}</small>
            </span>
            <ChevronDown aria-hidden="true" className="about-advanced-chevron h-4 w-4" />
          </summary>
          <div className="about-advanced-content">
            <label className="about-advanced-label" htmlFor="chatgpt-extra-launch-args">
              <strong>{t("ChatGPT 额外启动参数")}</strong>
              <small>{t("启动 ChatGPT 时追加这些参数；留空则保持默认启动行为。")}</small>
            </label>
            <Textarea
              className="launch-args-input about-advanced-input"
              id="chatgpt-extra-launch-args"
              placeholder="--force_high_performance_gpu"
              rows={4}
              spellCheck={false}
              value={codexExtraArgsToInput(codexExtraArgs)}
              onChange={(event) =>
                actions.setCodexExtraArgs(inputToCodexExtraArgs(event.currentTarget.value))
              }
            />
            <p className="field-hint">
              {t("每行一个参数，例如 --force_high_performance_gpu。不需要填写 open 或 --args。")}
            </p>
          </div>
        </details>
      </div>
    </SettingsCard>
  );
}
