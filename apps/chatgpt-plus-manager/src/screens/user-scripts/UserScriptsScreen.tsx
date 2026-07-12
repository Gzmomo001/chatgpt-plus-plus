import {
  Download,
  ExternalLink,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Badge as UiBadge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { t, tf } from "@/i18n";
import type {
  UserScriptsLocalItemView,
  UserScriptsMarketItemView,
  UserScriptsView,
} from "@/features/user-scripts/presentation";
import {
  isUserScriptsIntentPending,
  type UserScriptsIntent,
  type UserScriptsResourceKey,
} from "@/features/user-scripts/controller";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";
import { Metric } from "@/shared/ui/metric";

const SCRIPT_MARKET_REPOSITORY_URL =
  "https://github.com/BigPizzaV3/CodexPlusPlusScriptMarket";

export type UserScriptsActions = {
  executeUserScriptsAction: (intent: UserScriptsIntent) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
};

export function UserScriptsScreen({
  view,
  pending,
  actions,
}: {
  view: UserScriptsView;
  pending: readonly UserScriptsResourceKey[];
  actions: UserScriptsActions;
}) {
  const anyPending = pending.length > 0;
  const refreshMarketPending = isUserScriptsIntentPending(pending, {
    type: "refreshMarket",
  });
  const refreshLocalPending = isUserScriptsIntentPending(pending, {
    type: "refreshLocal",
  });
  return (
    <>
      <Panel>
        <CardHead title={t("脚本市场")} detail={tf("{0} 个市场脚本，已安装 {1} 个，本地整体 {2}", [view.summary.marketScriptCount, view.summary.installedCount, view.summary.localEnabled ? t("开启") : t("关闭")])} />
        <CardContent>
          <div className="metric-list">
            <Metric label={t("市场状态")} value={view.summary.marketMessage ?? t("尚未刷新")} />
            <Metric label={t("远程脚本")} value={tf("{0} 个", [view.summary.marketScriptCount])} />
            <Metric label={t("已安装")} value={tf("{0} 个", [view.summary.installedCount])} />
            <Metric label={t("本地整体")} value={view.summary.localEnabled ? t("开启") : t("关闭")} />
          </div>
          <Toolbar>
            <Button
              aria-busy={refreshMarketPending}
              disabled={anyPending}
              onClick={() => void actions.executeUserScriptsAction({ type: "refreshMarket" })}
            >
              <RefreshCw className="h-4 w-4" />
              {t("刷新市场")}
            </Button>
            <Button onClick={() => void actions.openExternalUrl(SCRIPT_MARKET_REPOSITORY_URL)} variant="secondary">
              <ExternalLink className="h-4 w-4" />
              {t("投稿")}
            </Button>
            <Button
              aria-busy={refreshLocalPending}
              disabled={anyPending}
              onClick={() => void actions.executeUserScriptsAction({ type: "refreshLocal" })}
              variant="secondary"
            >
              <RefreshCw className="h-4 w-4" />
              {t("刷新本地")}
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("市场脚本")} detail={view.market.updatedAt ? tf("清单更新时间：{0}", [view.market.updatedAt]) : t("从 GitHub 静态清单加载")} />
        <CardContent>
          {view.market.items.length ? (
            <div className="script-market-grid">
              {view.market.items.map((script) => (
                <MarketScriptCard key={script.id} script={script} pending={pending} anyPending={anyPending} actions={actions} />
              ))}
            </div>
          ) : (
            <div className="empty">{view.market.status === "failed" ? view.market.message : t("点击刷新市场加载远程脚本。")}</div>
          )}
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("本地脚本")} detail={t("内置、手动和市场安装脚本；可在这里启停或删除用户脚本")} />
        <CardContent>
          <div className="table">
            {view.localItems.length ? view.localItems.map((script) => <ScriptRow key={script.key} script={script} pending={pending} anyPending={anyPending} actions={actions} />) : <div className="empty">{t("未发现用户脚本。")}</div>}
          </div>
        </CardContent>
      </Panel>
    </>
  );
}

function MarketScriptCard({ script, pending, anyPending, actions }: { script: UserScriptsMarketItemView; pending: readonly UserScriptsResourceKey[]; anyPending: boolean; actions: UserScriptsActions }) {
  const status = script.updateAvailable ? t("可更新") : script.installed ? tf("已安装 {0}", [script.installedVersion]) : t("未安装");
  const installPending = isUserScriptsIntentPending(pending, {
    type: "install",
    id: script.id,
  });
  return (
    <div className="script-market-card">
      <div className="script-market-title">
        <div>
          <strong>{script.name}</strong>
          <span>{script.author || t("未知作者")}</span>
        </div>
        <UiBadge variant={script.updateAvailable ? "default" : script.installed ? "secondary" : "outline"}>{status}</UiBadge>
      </div>
      <p className="script-market-description">{script.description || t("暂无描述。")}</p>
      <div className="script-market-tags">
        <span className="script-market-tag">v{script.version}</span>
        {script.tags.map((tag) => (
          <span className="script-market-tag" key={tag}>{tag}</span>
        ))}
      </div>
      <div className="script-market-actions">
        <Button
          aria-busy={installPending}
          disabled={anyPending}
          onClick={() => void actions.executeUserScriptsAction({ type: "install", id: script.id })}
          size="sm"
        >
          <Download className="h-4 w-4" />
          {script.updateAvailable ? t("更新") : script.installed ? t("重新安装") : t("安装")}
        </Button>
        {script.homepage ? (
          <Button onClick={() => void actions.openExternalUrl(script.homepage)} size="sm" variant="secondary">
            <ExternalLink className="h-4 w-4" />
            {t("主页")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ScriptRow({ script, pending, anyPending, actions }: { script: UserScriptsLocalItemView; pending: readonly UserScriptsResourceKey[]; anyPending: boolean; actions: UserScriptsActions }) {
  const source = script.source === "market" ? tf("市场 · {0}", [script.marketVersion || t("未知版本")]) : script.source === "builtin" ? t("内置") : t("用户");
  const scriptPending = isUserScriptsIntentPending(pending, {
    type: "toggle",
    key: script.key,
    enabled: !script.enabled,
  });
  return (
    <div className="table-row">
      <span>{script.name}</span>
      <span>{source}</span>
      <span>{script.enabled ? t("启用") : t("关闭")}</span>
      <span>{script.status}</span>
      <div className="script-row-actions">
        <Button
          aria-busy={scriptPending}
          disabled={anyPending}
          onClick={() => void actions.executeUserScriptsAction({ type: "toggle", key: script.key, enabled: !script.enabled })}
          size="sm"
          variant="secondary"
        >
          {script.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          {script.enabled ? t("禁用") : t("启用")}
        </Button>
        {script.canDelete ? (
          <Button
            aria-busy={scriptPending}
            disabled={anyPending}
            onClick={() => void actions.executeUserScriptsAction({ type: "delete", key: script.key })}
            size="sm"
            variant="outline"
          >
            <Trash2 className="h-4 w-4" />
            {t("删除")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
