import { Download, Info, ListChecks, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { formatTime } from "@/shared/lib/time";
import { SettingsCard } from "@/shared/ui/layout";
import { Metric } from "@/shared/ui/metric";
import { StatusBadge as Badge } from "@/shared/ui/status-badge";
import { Button } from "@/shared/ui/button";
import { t, tf } from "@/i18n";
import type { ExportLocalSessionResult } from "@/shared/contracts/sessions";

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
  pendingOperation: "refresh" | "deleteOne" | "deleteSelection" | "export" | null;
  exportResult: ExportLocalSessionResult | null;
  providerSync: {
    active: boolean;
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
  syncProvidersNow: () => Promise<void>;
};

const SESSION_RENDER_BATCH_SIZE = 50;

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
      <SettingsCard title={t("会话管理")} detail={t("读取 Codex 本地 SQLite 会话库，会删除数据库记录和对应 rollout 文件")}>
        <div className="session-overview-layout">
          <div className="session-summary-grid">
            <Metric label={t("会话总数")} value={tf("{0} 个", [items.length])} />
            <Metric label={t("未归档")} value={tf("{0} 个", [activeCount])} />
            <Metric label={t("已归档")} value={tf("{0} 个", [archivedCount])} />
          </div>
          <div className="session-management-action">
            <Button disabled={view.providerSync.active} onClick={() => void actions.syncProvidersNow()} variant="outline">
              <RefreshCw className="h-4 w-4" />
              {view.providerSync.active ? t("正在修复…") : t("立刻修复历史会话")}
            </Button>
          </div>
        </div>
        <div className="session-database-row">
          <span>{t("数据库")}</span>
          <code>{view.dbPath ?? "~/.codex/sqlite/*.db"}</code>
        </div>
        <div className="hint-line">
          <Info className="h-4 w-4" />
          <span>{t("删除会创建本地备份；如果 Codex App 正在使用该会话，建议先关闭对应会话窗口再操作。")}</span>
        </div>
      </SettingsCard>
      <SettingsCard title={t("本地会话")} detail={items.length ? t("按更新时间倒序显示") : t("点击刷新会话读取本地数据库")}>
        <div className="session-list-toolbar">
          <span className="session-list-count">{tf("{0} 个会话", [items.length])}</span>
          <div className="session-list-actions">
            <Button aria-busy={pendingOperation === "refresh"} disabled={sessionsBusy} onClick={() => void actions.refreshSessions()}>
              <RefreshCw className="h-4 w-4" />
              {t("刷新会话")}
            </Button>
            {items.length ? (
              <Button disabled={sessionsBusy} onClick={() => void actions.deleteSelectedSessions()} variant="outline">
                <ListChecks className="h-4 w-4" />
                {t("多选")}
              </Button>
            ) : null}
          </div>
        </div>
        {items.length ? (
          <>
            {view.exportResult ? (
              <div className={`hint-line ${view.exportResult.status === "ok" ? "" : "error"}`}>
                <Download className="h-4 w-4" />
                <span>{view.exportResult.message}</span>
              </div>
            ) : null}
            {selectionMode ? (
              <div className="session-bulk-toolbar">
                <span className="session-selection-summary">{t("已选择")} {selectedCount} / {items.length} {t("个会话")}</span>
                <div className="session-selection-actions">
                  <Button disabled={allSelected || sessionsBusy} onClick={() => void actions.selectAllSessions()} size="sm" variant="outline">
                    {t("全选当前列表")}
                  </Button>
                  <Button disabled={!selectedCount || sessionsBusy} onClick={() => void actions.clearSessionSelection()} size="sm" variant="outline">
                    {t("清空选择")}
                  </Button>
                  <Button aria-busy={pendingOperation === "deleteSelection"} disabled={(selectionMode && !selectedCount) || sessionsBusy} onClick={() => void actions.deleteSelectedSessions()} size="sm" variant="outline">
                    <Trash2 className="h-4 w-4" />
                    {pendingOperation === "deleteSelection" ? t("正在删除…") : t("删除已选")}
                  </Button>
                </div>
              </div>
            ) : null}
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
                      <Button aria-label={t("导出")} aria-busy={pendingOperation === "export"} disabled={sessionsBusy} onClick={() => void actions.exportSession(session.id)} size="icon" title={t("导出")} variant="outline">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button aria-label={t("删除")} aria-busy={pendingOperation === "deleteOne"} className="session-delete-button" disabled={sessionsBusy} onClick={() => void actions.deleteSession(session.id)} size="icon" title={t("删除")} variant="outline">
                        <Trash2 className="h-4 w-4" />
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
      </SettingsCard>
    </>
  );
}
