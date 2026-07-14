import { AppWindow } from "lucide-react";

import { t } from "@/i18n";
import { projectOverviewHealth } from "@/screens/overview/presentation";
import type { OverviewResult } from "@/shared/contracts/overview";
import { Button } from "@/shared/ui/button";

export function OverviewHealthIndicators({
  overview,
  onRefresh,
}: {
  overview: OverviewResult | null;
  onRefresh: () => Promise<void>;
}) {
  const appHealth = projectOverviewHealth(overview).find((item) => item.id === "codex-app");

  if (!appHealth) return null;

  const label = `${t("Codex 应用")}: ${appHealth.detail || t("尚未检查 Codex 应用路径。")}`;

  return (
    <div className="topbar-health" aria-label={t("健康检查")} role="group">
      <Button
        aria-label={label}
        className="topbar-health-indicator"
        data-health={appHealth.ok ? "ok" : "attention"}
        onClick={() => void onRefresh()}
        size="icon"
        title={label}
        variant="ghost"
      >
        <AppWindow className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
