import { ExternalLink, MessageCircle } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { Textarea } from "@/shared/ui/textarea";
import { t, tf } from "@/i18n";
import type {
  DiagnosticsResult,
  UpdateResult,
} from "@/shared/contracts/diagnostics";
import type { OverviewResult } from "@/shared/contracts/overview";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";
import { Metric } from "@/shared/ui/metric";
import { TaskProgressBox, type TaskProgress } from "@/shared/ui/task-progress";

export type DiagnosticsActions = {
  openExternalUrl: (url: string) => Promise<void>;
  checkUpdate: () => Promise<void>;
  performUpdate: () => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  copyDiagnostics: () => Promise<void>;
};

export function AboutScreen({
  overview,
  update,
  updateInstallProgress,
  diagnostics,
  actions,
}: {
  overview: OverviewResult | null;
  update: UpdateResult | null;
  updateInstallProgress: TaskProgress;
  diagnostics: DiagnosticsResult | null;
  actions: DiagnosticsActions;
}) {
  return (
    <>
      <Panel>
        <CardHead title={t("关于 ChatGPT++")} detail={t("本地 Codex 增强、配置和安装包维护")} />
        <CardContent>
          <div className="metric-list">
            <Metric label={t("ChatGPT++ 版本")} value={overview?.currentVersion ?? update?.currentVersion ?? "-"} />
            <Metric label={t("项目地址")} value="github.com/Gzmomo001/chatgpt-plus-plus" />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.openExternalUrl("https://github.com/Gzmomo001/chatgpt-plus-plus")} variant="secondary">
              <ExternalLink className="h-4 w-4" />
              {t("打开项目主页")}
            </Button>
            <Button onClick={() => void actions.openExternalUrl("https://github.com/Gzmomo001/chatgpt-plus-plus/issues")} variant="secondary">
              <ExternalLink className="h-4 w-4" />
              {t("反馈问题")}
            </Button>
            <Button onClick={() => void actions.openExternalUrl("https://discord.gg/y96kX7A76v")} variant="secondary">
              <MessageCircle className="h-4 w-4" />
              Discord
            </Button>
            <Button onClick={() => void actions.openExternalUrl("https://t.me/CodexPlusPlus")} variant="secondary">
              <MessageCircle className="h-4 w-4" />
              Telegram
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("GitHub Release 更新")} detail={tf("当前版本 {0}", [overview?.currentVersion ?? update?.currentVersion ?? "-"])} />
        <CardContent>
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
        </CardContent>
      </Panel>
      <DiagnosticsPanel diagnostics={diagnostics} actions={actions} />
    </>
  );
}

function DiagnosticsPanel({ diagnostics, actions }: { diagnostics: DiagnosticsResult | null; actions: DiagnosticsActions }) {
  return (
    <Panel>
      <CardHead title={t("诊断报告")} detail={t("包含版本、路径、设置和平台信息")} />
      <CardContent>
        <Textarea className="log-view tall" readOnly value={diagnostics?.report ?? t("尚未生成诊断报告。")} />
        <Toolbar>
          <Button onClick={() => void actions.refreshDiagnostics()}>{t("重新生成")}</Button>
          <Button variant="secondary" onClick={() => void actions.copyDiagnostics()}>
            {t("复制报告")}
          </Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}
