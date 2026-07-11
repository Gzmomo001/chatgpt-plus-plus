import { t } from "@/i18n";

export type TaskProgress = {
  active: boolean;
  percent: number;
  message: string;
};

export function TaskProgressBox({
  progress,
  title,
  completedTitle = t("上次修复结果"),
}: {
  progress: TaskProgress;
  title: string;
  completedTitle?: string;
}) {
  if (!progress.active && progress.percent <= 0) return null;
  return (
    <div className="provider-sync-progress task-progress" data-active={progress.active}>
      <div className="provider-sync-progress-head">
        <strong>{progress.active ? title : completedTitle}</strong>
        <span>{progress.percent}%</span>
      </div>
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.percent}
        className="provider-sync-progress-bar"
        role="progressbar"
      >
        <div className="provider-sync-progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <small>{progress.message}</small>
    </div>
  );
}
