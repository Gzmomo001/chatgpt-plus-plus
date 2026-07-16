import { Bell, CheckCircle2, Trash2 } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/shared/ui/button";
import { Toolbar } from "@/shared/ui/layout";

export type NoticeView = {
  title: string;
  message: string;
  status?: string;
};

export type ConfirmView = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
};

export function NoticeDialog({
  notice,
  onClose,
}: {
  notice: NoticeView;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className={`toast-card ${notice.status === "failed" ? "failed" : ""}`}>
        <div className="toast-progress" />
        <div className="toast-icon">
          {notice.status === "failed" ? (
            <Bell className="h-5 w-5" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
        </div>
        <div className="toast-body">
          <h2>{notice.title}</h2>
          <p>{notice.message}</p>
        </div>
        <button className="toast-close" onClick={onClose} type="button">
          ×
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  confirm,
  onConfirm,
  onCancel,
}: {
  confirm: ConfirmView;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>{confirm.title}</h2>
            <p className="modal-message">{confirm.message}</p>
          </div>
          <button className="toast-close" onClick={onCancel} type="button">
            ×
          </button>
        </div>
        <Toolbar>
          <Button onClick={onConfirm}>
            <Trash2 className="h-4 w-4" />
            {confirm.confirmText}
          </Button>
          <Button onClick={onCancel} variant="secondary">
            {confirm.cancelText}
          </Button>
        </Toolbar>
      </div>
    </div>
  );
}
