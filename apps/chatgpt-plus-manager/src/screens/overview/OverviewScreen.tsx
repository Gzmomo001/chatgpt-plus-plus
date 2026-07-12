import { Bell, CheckCircle2, ExternalLink, Network, RefreshCw, Rocket, Wrench } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { t } from "@/i18n";
import type { LaunchStatus, OverviewResult } from "@/shared/contracts/overview";
import { formatTime } from "@/shared/lib/time";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";
import { Metric } from "@/shared/ui/metric";
import { StatusBadge as Badge } from "@/shared/ui/status-badge";
import { TaskProgressBox, type TaskProgress } from "@/shared/ui/task-progress";

import { projectOverviewHealth, type HealthItem } from "./presentation";

export type OverviewActions = {
  openExternalUrl: (url: string) => Promise<void>;
  checkHealth: () => Promise<void>;
  repairShortcuts: () => Promise<void>;
  repairPluginMarketplace: () => Promise<void>;
  launch: () => Promise<void>;
  goAbout: () => Promise<void>;
};

export function OverviewScreen({
  overview,
  pluginMarketplaceProgress,
  actions,
}: {
  overview: OverviewResult | null;
  pluginMarketplaceProgress: TaskProgress;
  actions: OverviewActions;
}) {
  const health = projectOverviewHealth(overview);
  return (
    <>
      <Panel className="jojocode-overview">
        <CardContent>
          <div className="jojocode-overview-layout">
            <div className="jojocode-overview-main">
              <div className="jojocode-overview-mark">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <span className="eyebrow">{t("官方中转站")}</span>
                <h2>JOJO Code</h2>
                <p>
                  {t("ChatGPT++ 官方中转站，主打稳定接入和划算价格，支持 GPT-5.6 全系列、Fable 5、Sonnet 5、GPT-5.5、GPT-5.4、Claude Opus 4.8、Claude Opus 4.7、gpt-image-2 等模型与图像能力。")}
                </p>
              </div>
            </div>
            <div className="jojocode-overview-side">
              <div className="jojocode-model-tags">
                <span>GPT-5.6 全系列</span>
                <span>Fable 5</span>
                <span>Sonnet 5</span>
                <span>GPT-5.5</span>
                <span>GPT-5.4</span>
                <span>Opus 4.8</span>
                <span>Opus 4.7</span>
                <span>gpt-image-2</span>
              </div>
              <Button onClick={() => void actions.openExternalUrl("https://jojocode.com/")}>
                <ExternalLink className="h-4 w-4" />
                {t("打开 JOJO Code")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("健康检查")} detail={t("概览只展示关键问题，具体配置在对应页面处理")} />
        <CardContent>
          <div className="health-grid">
            {health.map((item) => {
              const copy = healthCopy(item);
              return (
                <div className={`health-item ${item.ok ? "ok" : "needs-fix"}`} key={item.id}>
                  {item.ok ? <CheckCircle2 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  <div>
                    <strong>{copy.title}</strong>
                    <span>{item.detail || copy.missingDetail}</span>
                  </div>
                  <Badge status={item.status} />
                </div>
              );
            })}
          </div>
          <Toolbar>
            <Button onClick={() => void actions.checkHealth()}>
              <RefreshCw className="h-4 w-4" />
              {t("检查")}
            </Button>
            <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>
              <Wrench className="h-4 w-4" />
              {t("修复入口")}
            </Button>
            <Button disabled={pluginMarketplaceProgress.active} variant="secondary" onClick={() => void actions.repairPluginMarketplace()}>
              {pluginMarketplaceProgress.active ? t("正在修复…") : t("修复插件市场")}
            </Button>
          </Toolbar>
          <TaskProgressBox progress={pluginMarketplaceProgress} title={t("插件市场修复进度")} />
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("最近启动")} detail={overview?.logsPath ?? t("暂无状态文件")} />
        <CardContent>
          <LatestLaunch status={overview?.latestLaunch ?? null} />
          <Toolbar>
            <Button onClick={() => void actions.launch()}>
              <Rocket className="h-4 w-4" />
              {t("启动 ChatGPT++")}
            </Button>
            <Button variant="secondary" onClick={() => void actions.goAbout()}>
              {t("打开关于")}
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}

function healthCopy(item: HealthItem) {
  switch (item.id) {
    case "codex-version":
      return { title: t("Codex 版本"), missingDetail: t("未检测到 Codex 应用版本。") };
    case "codex-app":
      return { title: t("Codex 应用"), missingDetail: t("尚未检查 Codex 应用路径。") };
    case "app-shortcut":
      return {
        title: t("ChatGPT++ 应用入口"),
        missingDetail: t("缺少 ChatGPT++ 应用快捷方式时可在安装维护页修复。"),
      };
    default:
      return assertNever(item.id);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Overview health item: ${value}`);
}

function LatestLaunch({ status }: { status: LaunchStatus | null }) {
  if (!status) return <div className="empty">{t("暂无启动状态。")}</div>;
  return (
    <div className="metric-list">
      <Metric label={t("状态")} value={status.status} />
      <Metric label={t("消息")} value={status.message} />
      <Metric label="Proxy" value={String(status.protocolProxyPort ?? "-")} />
      <Metric label={t("时间")} value={formatTime(status.startedAtMs)} />
    </div>
  );
}
