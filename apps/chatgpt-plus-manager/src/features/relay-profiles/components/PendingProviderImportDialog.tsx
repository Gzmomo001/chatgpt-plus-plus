import { Download } from "lucide-react";

import { t } from "@/i18n";
import { Button } from "@/shared/ui/button";
import { Toolbar } from "@/shared/ui/layout";
import { Metric } from "@/shared/ui/metric";
import type { PendingProviderImportView } from "../pending-provider-import";

export function PendingProviderImportDialog({
  view,
  onConfirm,
  onDismiss,
}: {
  view: PendingProviderImportView;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card provider-import-modal">
        <div className="modal-head">
          <div>
            <h2>{t("导入 ChatGPT++ 供应商")}</h2>
            <p>{t("检测到来自网页的供应商配置导入请求，确认后会写入本机 ChatGPT++。")}</p>
          </div>
          <button className="toast-close" onClick={onDismiss} type="button">
            ×
          </button>
        </div>
        <div className="metric-list">
          <Metric label={t("名称")} value={view.name} />
          <Metric label="Base URL" value={view.baseUrl} />
          <Metric label={t("协议")} value={view.protocol} />
          <Metric label={t("模式")} value={view.mode} />
          <Metric label="API Key" value={view.maskedApiKey} />
        </div>
        <Toolbar>
          <Button onClick={onConfirm}>
            <Download className="h-4 w-4" />
            {t("确认导入")}
          </Button>
          <Button onClick={onDismiss} variant="secondary">
            {t("取消")}
          </Button>
        </Toolbar>
      </div>
    </div>
  );
}
