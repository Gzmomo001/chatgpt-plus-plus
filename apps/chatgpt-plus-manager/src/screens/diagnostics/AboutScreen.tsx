import { ClipboardCopy, ExternalLink, ShieldCheck } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { Textarea } from "@/shared/ui/textarea";
import { t, tf } from "@/i18n";
import type { UpdateResult } from "@/shared/contracts/diagnostics";
import type { OverviewResult } from "@/shared/contracts/overview";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";
import { Metric } from "@/shared/ui/metric";
import { TaskProgressBox, type TaskProgress } from "@/shared/ui/task-progress";

export type DiagnosticsActions = {
  openExternalUrl: (url: string) => Promise<void>;
  checkUpdate: () => Promise<void>;
  performUpdate: () => Promise<void>;
  copyDiagnostics: () => Promise<void>;
};

export function AboutScreen({
  overview,
  update,
  updateInstallProgress,
  actions,
}: {
  overview: OverviewResult | null;
  update: UpdateResult | null;
  updateInstallProgress: TaskProgress;
  actions: DiagnosticsActions;
}) {
  return (
    <Panel className="about-panel">
      <CardHead title={t("关于 ChatGPT++")} />
      <CardContent>
        <section className="about-section">
          <div className="metric-list">
            <Metric label={t("ChatGPT++ 版本")} value={overview?.currentVersion ?? update?.currentVersion ?? "-"} />
            <Metric label={t("项目地址")} value="github.com/Gzmomo001/chatgpt-plus-plus" />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.openExternalUrl("https://github.com/Gzmomo001/chatgpt-plus-plus")} variant="secondary">
              <ExternalLink className="h-4 w-4" />
              {t("打开项目主页")}
            </Button>
          </Toolbar>
          <div className="diagnostic-feedback-flow">
            <div className="hint-line">
              <ShieldCheck className="h-4 w-4" />
              <span>{t("遇到问题时，请先复制诊断报告，再前往 GitHub 反馈，并将报告粘贴到 Issue 中。")}</span>
            </div>
            <Toolbar>
              <Button onClick={() => void actions.copyDiagnostics()}>
                <ClipboardCopy className="h-4 w-4" />
                {t("复制诊断报告")}
              </Button>
              <Button onClick={() => void actions.openExternalUrl("https://github.com/Gzmomo001/chatgpt-plus-plus/issues")} variant="secondary">
                <ExternalLink className="h-4 w-4" />
                {t("反馈问题")}
              </Button>
            </Toolbar>
          </div>
        </section>
        <section className="about-section about-update-section">
          <div className="about-section-head">
            <h4>{t("GitHub Release 更新")}</h4>
            <span>{tf("当前版本 {0}", [overview?.currentVersion ?? update?.currentVersion ?? "-"])}</span>
          </div>
          <div className="metric-list">
            <Metric label={t("状态")} value={update?.status ?? "not_checked"} />
            <Metric label={t("最新版本")} value={update?.latestVersion ?? t("未检查")} />
            <Metric label={t("资源")} value={update?.assetName ?? "-"} />
            <Metric label={t("进度")} value={`${update?.progress ?? 0}%`} />
          </div>
          <Textarea className="log-view" readOnly value={update?.releaseSummary || update?.message || t("尚未检查 GitHub Release；更新会下载并启动安装包。")} />
          <TaskProgressBox completedTitle={t("上次更新结果")} progress={updateInstallProgress} title={t("安装包更新进度")} />
          <Toolbar>
            <Button onClick={() => void actions.checkUpdate()}>{t("检查更新")}</Button>
            <Button disabled={updateInstallProgress.active} variant="secondary" onClick={() => void actions.performUpdate()}>
              {updateInstallProgress.active ? t("正在下载安装包…") : t("下载并运行安装包")}
            </Button>
          </Toolbar>
        </section>
      </CardContent>
    </Panel>
  );
}
