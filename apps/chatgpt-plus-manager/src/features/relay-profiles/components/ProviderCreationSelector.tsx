import { Download, RefreshCw, Server, Share2 } from "lucide-react";

import { t } from "@/i18n";
import { Button } from "@/shared/ui/button";

import type { CcsProvidersResult } from "../contracts";
import { ccsProviderSummary } from "../presentation";

export type ProviderCreationKind = "standard" | "aggregate" | "import";

export function ProviderCreationSelector({
  selected,
  ccsProviders,
  onSelect,
  onImport,
  onImported,
  onRefresh,
}: {
  selected: ProviderCreationKind;
  ccsProviders: CcsProvidersResult | null;
  onSelect: (kind: ProviderCreationKind) => void;
  onImport: () => Promise<void>;
  onImported: () => void;
  onRefresh: (silent?: boolean) => Promise<CcsProvidersResult | null>;
}) {
  const options = [
    { kind: "standard" as const, label: t("普通供应商"), icon: Server },
    { kind: "aggregate" as const, label: t("聚合供应商"), icon: Share2 },
    { kind: "import" as const, label: t("从第三方导入"), icon: Download },
  ];

  return (
    <div className="provider-creation-selector">
      <div
        aria-label={t("选择供应商类型")}
        className="provider-type-segmented"
        data-selection={selected}
        role="group"
      >
        <span className="provider-type-slider" aria-hidden="true" />
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              aria-pressed={selected === option.kind}
              className="provider-type-segment"
              key={option.kind}
              onClick={() => {
                onSelect(option.kind);
                if (option.kind === "import" && !ccsProviders) void onRefresh(true);
              }}
              type="button"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      {selected === "import" ? (
        <div className="provider-import-panel">
          <div className="provider-import-copy">
            <strong>ccswitch</strong>
            <small>{ccsProviderSummary(ccsProviders)}</small>
          </div>
          <div className="provider-import-actions">
            <Button
              disabled={!ccsProviders?.providers.length}
              onClick={() => {
                onImported();
                void onImport();
              }}
              variant="secondary"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("确认导入")}
            </Button>
            <Button onClick={() => void onRefresh()} variant="ghost">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t("刷新列表")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
