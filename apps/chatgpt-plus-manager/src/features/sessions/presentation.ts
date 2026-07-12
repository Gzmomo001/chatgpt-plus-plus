import { t, tf } from "@/i18n";

type ProviderSyncResult = {
  changedSessionFiles?: number;
  sqliteRowsUpdated?: number;
  targetProvider?: string;
  skippedLockedRolloutFiles?: readonly unknown[];
};

export function providerSyncProgressMessage(result: ProviderSyncResult): string {
  const changed = result.changedSessionFiles ?? 0;
  const rows = result.sqliteRowsUpdated ?? 0;
  const target = result.targetProvider || t("当前 provider");
  const skipped = result.skippedLockedRolloutFiles?.length ?? 0;
  const skippedText = skipped ? tf("，跳过 {0} 个占用文件", [skipped]) : "";
  return tf("已同步到 {0}：修复 {1} 个会话文件，更新 {2} 行索引{3}。", [
    target,
    changed,
    rows,
    skippedText,
  ]);
}

export function truncateSessionDeletePreview(value: string): string {
  const normalized = value.trim();
  return normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;
}
