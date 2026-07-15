import { BarChart3, Download, Info, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { formatTime } from "@/shared/lib/time";
import { Field } from "@/shared/ui/field";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";
import { Metric } from "@/shared/ui/metric";
import { StatusBadge as Badge } from "@/shared/ui/status-badge";
import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { t, tf } from "@/i18n";
import type {
  ExportLocalSessionResult,
  LocalSessionUsageResult,
} from "@/shared/contracts/sessions";

export type SessionsView = {
  dbPath: string | null;
  rows: readonly {
    id: string;
    title: string;
    cwd: string;
    modelProvider: string;
    archived: boolean;
    updatedAtMs: number | null;
  }[];
  selectedSessionIds: readonly string[];
  selectionMode: boolean;
  pendingOperation: "refresh" | "deleteOne" | "deleteSelection" | "export" | "usage" | null;
  activeSessionId: string | null;
  exportResult: ExportLocalSessionResult | null;
  usageResult: LocalSessionUsageResult | null;
  providerSync: {
    active: boolean;
    percent: number;
    message: string;
    enabled: boolean;
    selectedTarget: string;
    targets: readonly {
      id: string;
      sources: readonly ("config" | "rollout" | "sqlite" | "manual")[];
      isCurrentProvider: boolean;
    }[];
  };
};

export type SessionsActions = {
  refreshSessions: () => Promise<void>;
  toggleSessionSelection: (sessionId: string, selected: boolean) => Promise<void>;
  selectAllSessions: () => Promise<void>;
  clearSessionSelection: () => Promise<void>;
  deleteSelectedSessions: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportSession: (sessionId: string) => Promise<void>;
  loadSessionUsage: (sessionId: string) => Promise<void>;
  closeSessionDetail: () => Promise<void>;
  syncProvidersNow: () => Promise<void>;
  selectProviderSyncTarget: (provider: string) => void;
  setProviderSyncEnabled: (enabled: boolean) => void;
  saveProviderSyncSettings: () => Promise<void>;
};

const SESSION_RENDER_BATCH_SIZE = 50;

function providerSyncTargetLabel(target: SessionsView["providerSync"]["targets"][number]): string {
  const providerSyncSourceLabels: Record<"config" | "rollout" | "sqlite" | "manual", string> = {
    config: t("配置"),
    rollout: t("会话"),
    sqlite: t("索引"),
    manual: t("手动"),
  };
  const labels = target.sources
    .map((source) => providerSyncSourceLabels[source])
    .filter(Boolean);
  const current = target.isCurrentProvider ? [t("当前")] : [];
  return [...labels, ...current].join(" / ") || t("发现");
}

export function SessionsScreen({
  view,
  actions,
}: {
  view: SessionsView;
  actions: SessionsActions;
}) {
  const items = view.rows;
  const [renderLimit, setRenderLimit] = useState(SESSION_RENDER_BATCH_SIZE);
  const activeCount = items.filter((item) => !item.archived).length;
  const archivedCount = items.length - activeCount;
  const selectedIds = new Set(view.selectedSessionIds);
  const selectedCount = view.selectedSessionIds.length;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const { selectionMode, pendingOperation } = view;
  const sessionsBusy = pendingOperation !== null;
  const renderedItems = items.slice(0, renderLimit);

  useEffect(() => {
    if (renderLimit >= items.length) return;
    const frame = window.requestAnimationFrame(() => {
      setRenderLimit((current) =>
        Math.min(current + SESSION_RENDER_BATCH_SIZE, items.length),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items.length, renderLimit]);

  return (
    <>
      <Panel>
        <CardHead title={t("会话管理")} detail={t("读取 Codex 本地 SQLite 会话库，会删除数据库记录和对应 rollout 文件")} />
        <CardContent>
          <div className="metric-list">
            <Metric label={t("会话总数")} value={tf("{0} 个", [items.length])} />
            <Metric label={t("未归档")} value={tf("{0} 个", [activeCount])} />
            <Metric label={t("已归档")} value={tf("{0} 个", [archivedCount])} />
            <Metric label={t("数据库")} value={view.dbPath ?? "~/.codex/sqlite/*.db"} />
          </div>
          <div className="form-row">
            <Field label={t("同步目标")}>
              <select
                className="select-input"
                disabled={view.providerSync.active || !view.providerSync.targets.length}
                value={view.providerSync.selectedTarget}
                onChange={(event) => actions.selectProviderSyncTarget(event.currentTarget.value)}
              >
                {view.providerSync.targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.id}{t("（")}{providerSyncTargetLabel(target)}{t("）")}
                  </option>
                ))}
                {!view.providerSync.targets.length ? <option value="">{t("当前配置 provider")}</option> : null}
              </select>
            </Field>
          </div>
          <Toolbar>
            <Button aria-busy={pendingOperation === "refresh"} disabled={sessionsBusy} onClick={() => void actions.refreshSessions()}>
              <RefreshCw className="h-4 w-4" />
              {t("刷新会话")}
            </Button>
            <Button disabled={view.providerSync.active} onClick={() => void actions.syncProvidersNow()} variant="outline">
              <RefreshCw className="h-4 w-4" />
              {view.providerSync.active ? t("正在修复…") : t("立刻修复历史会话")}
            </Button>
          </Toolbar>
          <div className="provider-sync-progress" data-active={view.providerSync.active}>
            <div className="provider-sync-progress-head">
              <strong>{view.providerSync.active ? t("正在修复历史会话") : t("历史会话修复进度")}</strong>
              <span>{view.providerSync.percent}%</span>
            </div>
            <div
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={view.providerSync.percent}
              className="provider-sync-progress-bar"
              role="progressbar"
            >
              <div className="provider-sync-progress-fill" style={{ width: `${view.providerSync.percent}%` }} />
            </div>
            <small>{view.providerSync.message}</small>
          </div>
          <div className="hint-line">
            <Info className="h-4 w-4" />
            <span>{t("删除会创建本地备份；如果 Codex App 正在使用该会话，建议先关闭对应会话窗口再操作。")}</span>
          </div>
          <label className="switch-row">
            <input
              checked={view.providerSync.enabled}
              onChange={(event) => actions.setProviderSyncEnabled(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>
              <strong>{t("启动前自动修复历史会话")}</strong>
              <small>{t("开启后，通过 ChatGPT++ 启动 Codex 前自动整理一次旧对话的归属标记。")}</small>
            </span>
          </label>
          <Toolbar>
            <Button onClick={() => void actions.saveProviderSyncSettings()}>{t("保存自动修复设置")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("本地会话")} detail={items.length ? t("按更新时间倒序显示") : t("点击刷新会话读取本地数据库")} />
        <CardContent>
          {items.length ? (
            <>
              {view.exportResult ? (
                <div className={`hint-line ${view.exportResult.status === "ok" ? "" : "error"}`}>
                  <Download className="h-4 w-4" />
                  <span>{view.exportResult.message}</span>
                </div>
              ) : null}
              <div className="session-list-toolbar">
                <span className="session-selection-summary">{t("已选择")} {selectedCount} / {items.length} {t("个会话")}</span>
                <div className="session-selection-actions">
                  <Button disabled={allSelected || sessionsBusy} onClick={() => void actions.selectAllSessions()} size="sm" variant="outline">
                    {t("全选当前列表")}
                  </Button>
                  <Button disabled={!selectedCount || sessionsBusy} onClick={() => void actions.clearSessionSelection()} size="sm" variant="outline">
                    {t("清空选择")}
                  </Button>
                  <Button aria-busy={pendingOperation === "deleteSelection"} disabled={(selectionMode && !selectedCount) || sessionsBusy} onClick={() => void actions.deleteSelectedSessions()} size="sm" variant="outline">
                    {selectionMode ? <Trash2 className="h-4 w-4" /> : null}
                    {selectionMode ? (pendingOperation === "deleteSelection" ? t("正在删除…") : t("删除已选")) : t("多选")}
                  </Button>
                </div>
              </div>
              <div className="session-list">
                {renderedItems.map((session) => {
                  const selected = selectedIds.has(session.id);
                  return (
                    <div className="session-row" data-selection-mode={selectionMode} data-selected={selected} key={session.id}>
                      {selectionMode ? (
                        <label className="session-select" title={t("选择会话")}>
                          <input
                            aria-label={tf("选择会话 {0}", [session.title || session.id])}
                            checked={selected}
                            disabled={sessionsBusy}
                            onChange={(event) => void actions.toggleSessionSelection(session.id, event.currentTarget.checked)}
                            type="checkbox"
                          />
                        </label>
                      ) : null}
                      <div className="session-main">
                        <strong>{session.title || t("未命名会话")}</strong>
                        <span>{session.id}</span>
                        <small>{session.cwd || t("未记录项目路径")}</small>
                      </div>
                      <div className="session-meta">
                        <Badge status={session.archived ? "archived" : "ok"} />
                        <span>{session.modelProvider || t("provider 未记录")}</span>
                        <span>{formatTime(session.updatedAtMs ?? 0)}</span>
                      </div>
                      <div className="session-row-actions">
                        <Button aria-busy={pendingOperation === "export"} disabled={sessionsBusy} variant="outline" onClick={() => void actions.exportSession(session.id)}>
                          <Download className="h-4 w-4" />
                          {pendingOperation === "export" ? t("正在导出…") : t("导出")}
                        </Button>
                        <Button aria-busy={pendingOperation === "usage"} disabled={sessionsBusy} variant="outline" onClick={() => void actions.loadSessionUsage(session.id)}>
                          <BarChart3 className="h-4 w-4" />
                          {t("Token 用量")}
                        </Button>
                        <Button aria-busy={pendingOperation === "deleteOne"} className="session-delete-button" disabled={sessionsBusy} variant="outline" onClick={() => void actions.deleteSession(session.id)}>
                          <Trash2 className="h-4 w-4" />
                          {t("删除")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty">{t("未读取到本地会话，或当前 SQLite 会话库不存在。")}</div>
          )}
        </CardContent>
      </Panel>
      {view.activeSessionId ? (
        <SessionUsagePanel
          result={view.usageResult}
          running={pendingOperation === "usage"}
          sessionTitle={items.find((item) => item.id === view.activeSessionId)?.title || view.activeSessionId}
          onClose={actions.closeSessionDetail}
        />
      ) : null}
    </>
  );
}

function SessionUsagePanel({ result, running, sessionTitle, onClose }: {
  result: LocalSessionUsageResult | null;
  running: boolean;
  sessionTitle: string;
  onClose: () => Promise<void>;
}) {
  const history = result?.history ?? [];
  const latest = history.at(-1);
  return (
    <Panel>
      <CardHead title={t("Token 使用历史")} detail={sessionTitle} />
      <CardContent>
        <Toolbar>
          <Button disabled={running} onClick={() => void onClose()} size="sm" variant="outline">
            <X className="h-4 w-4" />{t("关闭")}
          </Button>
        </Toolbar>
        {running ? <div className="empty">{t("正在读取 Token 使用历史…")}</div> : null}
        {!running && result && result.status !== "ok" ? (
          <div className="empty error">{result.message}</div>
        ) : null}
        {!running && result?.status === "ok" && !history.length ? (
          <div className="empty">{t("该会话暂时没有 Token 使用记录。")}</div>
        ) : null}
        {!running && history.length ? (
          <>
            <div className="metric-list">
              <Metric label={t("记录数")} value={tf("{0} 条", [history.length])} />
              <Metric label={t("最近上下文用量")} value={String(latest?.usage.contextUsed ?? 0)} />
              <Metric label={t("上下文上限")} value={String(latest?.usage.contextLimit ?? 0)} />
            </div>
            <div className="session-usage-list">
              {history.map((point, index) => (
                <div className="status-row" key={`${point.turnId}-${point.observedAt}-${index}`}>
                  <span>{point.turnId || tf("记录 {0}", [index + 1])}</span>
                  <code>{tf("输入 {0} / 输出 {1} / 合计 {2} / 缓存 {3}", [
                    point.usage.inputTokens,
                    point.usage.outputTokens,
                    point.usage.totalTokens,
                    point.usage.cachedTokens,
                  ])}</code>
                  <small>{point.observedAt || t("时间未知")}</small>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Panel>
  );
}
