import { Bell, CheckCircle2, RefreshCw, Rocket } from "lucide-react";

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
  checkHealth: () => Promise<void>;
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
              {t("查看更新与诊断")}
            </Button>
          </Toolbar>
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
            <Button disabled={pluginMarketplaceProgress.active} variant="secondary" onClick={() => void actions.repairPluginMarketplace()}>
              {pluginMarketplaceProgress.active ? t("正在修复…") : t("修复插件市场")}
            </Button>
          </Toolbar>
          <TaskProgressBox progress={pluginMarketplaceProgress} title={t("插件市场修复进度")} />
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
