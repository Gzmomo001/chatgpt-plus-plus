import { Download, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { EnvConflictNotice } from "@/features/relay-profiles/components/RelayFeedback";
import { RelayProfileDetail } from "@/features/relay-profiles/components/RelayProfileDetail";
import { RelayProfileList } from "@/features/relay-profiles/components/RelayProfileList";
import type {
  CcsProvidersResult,
  EnvConflictsResult,
  RelayFilesResult,
  RelayProfileActions,
  RelaySettings,
  RelayProfileView,
} from "@/features/relay-profiles/contracts";
import { shouldRefreshRelayFiles } from "@/features/relay-profiles/controller";
import { open as openProfileEditor } from "@/features/relay-profiles/editor";
import { ccsProviderSummary } from "@/features/relay-profiles/presentation";
import type {
  RelayProfileEditableMode,
  ReconciledRelayProfileSettings,
} from "@/features/relay-profiles/types";
import { t, tf } from "@/i18n";

const emptyContextSelection = { mcpServers: [], skills: [], plugins: [] };

type RelayProfilesScreenProps<Settings extends RelaySettings> = {
  relayFiles: RelayFilesResult | null;
  envConflicts: EnvConflictsResult | null;
  ccsProviders: CcsProvidersResult | null;
  form: Settings;
  onFormChange: (value: ReconciledRelayProfileSettings<Settings>) => void;
  actions: RelayProfileActions<Settings>;
};

export function RelayProfilesScreen<Settings extends RelaySettings>({
  relayFiles,
  envConflicts,
  ccsProviders,
  form,
  onFormChange,
  actions,
}: RelayProfilesScreenProps<Settings>) {
  const [detailProfileId, setDetailProfileId] = useState<string | null>(null);
  const [newProfileDraft, setNewProfileDraft] = useState<RelayProfileView | null>(null);
  const [thirdPartyImportOpen, setThirdPartyImportOpen] = useState(false);
  const refreshRelayFilesRef = useRef(actions.refreshRelayFiles);
  const detailProfile = newProfileDraft
    ?? form.relayProfiles.find((profile) => profile.id === detailProfileId)
    ?? null;
  const isNewProfile = newProfileDraft !== null;

  const saveRelaySettings = async (next: ReconciledRelayProfileSettings<Settings>) => {
    onFormChange(next);
    await actions.saveSettingsValue(next, true);
  };

  const createProfile = (mode: RelayProfileEditableMode) => openProfileEditor({
    settings: form,
    defaultContextSelection: emptyContextSelection,
    focus: {
      type: "create",
      id: `${mode === "aggregate" ? "aggregate" : "relay"}-${Date.now().toString(36)}`,
      name: mode === "aggregate"
        ? t("聚合供应商")
        : tf("供应商 {0}", [form.relayProfiles.length + 1]),
      mode,
    },
  }).preview.profile;

  useEffect(() => {
    if (
      !newProfileDraft
      && detailProfileId
      && !form.relayProfiles.some((profile) => profile.id === detailProfileId)
    ) {
      setDetailProfileId(null);
    }
  }, [detailProfileId, newProfileDraft, form.relayProfiles]);

  useEffect(() => {
    refreshRelayFilesRef.current = actions.refreshRelayFiles;
  }, [actions.refreshRelayFiles]);

  useEffect(() => {
    if (shouldRefreshRelayFiles({
      detailProfileId,
      isNewProfile: newProfileDraft !== null,
      activeRelayId: form.activeRelayId,
    })) {
      void refreshRelayFilesRef.current();
    }
  }, [detailProfileId, form.activeRelayId, newProfileDraft]);

  if (detailProfile) {
    return (
      <RelayProfileDetail
        profile={detailProfile}
        relayFiles={!isNewProfile && detailProfile.id === form.activeRelayId
          ? relayFiles
          : null}
        form={form}
        isNew={isNewProfile}
        onBack={() => {
          setNewProfileDraft(null);
          setDetailProfileId(null);
        }}
        onFormChange={saveRelaySettings}
        onSaved={() => {
          setNewProfileDraft(null);
          setDetailProfileId(null);
        }}
        actions={actions}
      />
    );
  }

  const openNewProfile = (mode: RelayProfileEditableMode) => {
    const draft = createProfile(mode);
    setNewProfileDraft(draft);
    setDetailProfileId(null);
    if (mode === "aggregate" && !(draft.aggregate?.members.length ?? 0)) {
      void actions.showMessage(
        t("添加聚合供应商"),
        t("已打开聚合供应商详情；请先添加或完善至少 1 个普通 API 供应商的 Base URL / Key，再勾选为成员。"),
        "failed",
      );
    }
  };

  return (
    <Card className="panel ">
      <CardHeader className="panel-head">
        <CardTitle>{t("供应商列表")}</CardTitle>
        <CardDescription>
          {tf("{0} 个供应商配置；可拖动排序，点编辑进入详情", [form.relayProfiles.length])}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EnvConflictNotice envConflicts={envConflicts} actions={actions} />
        <label className="switch-row relay-master-switch">
          <input
            checked={form.relayProfilesEnabled}
            onChange={(event) => void saveRelaySettings({
              ...form,
              relayProfilesEnabled: event.currentTarget.checked,
            })}
            type="checkbox"
          />
          <span>
            <strong>{t("启用供应商配置切换")}</strong>
            <small>{t("关闭后本工具不会在手动切换时写入 Codex 的 config.toml / auth.json；启动 Codex 时始终不会自动改这些文件。")}</small>
          </span>
        </label>
        <div className="relay-add-row">
          <Button variant="secondary" onClick={() => openNewProfile("official")}>
            <Plus className="h-4 w-4" />
            {t("添加供应商")}
          </Button>
          <Button variant="secondary" onClick={() => openNewProfile("aggregate")}>
            <Plus className="h-4 w-4" />
            {t("添加聚合供应商")}
          </Button>
          <div className="third-party-import">
            <Button
              onClick={() => {
                setThirdPartyImportOpen((open) => !open);
                if (!ccsProviders) void actions.refreshCcsProviders(true);
              }}
              variant="secondary"
            >
              <Download className="h-4 w-4" />
              {t("从第三方导入")}
            </Button>
            {thirdPartyImportOpen ? (
              <div className="third-party-import-menu">
                <button
                  disabled={!ccsProviders?.providers.length}
                  onClick={() => {
                    setThirdPartyImportOpen(false);
                    void actions.importCcsProviders();
                  }}
                  type="button"
                >
                  <strong>ccswitch</strong>
                  <span>{ccsProviderSummary(ccsProviders)}</span>
                </button>
                <button
                  onClick={() => void actions.refreshCcsProviders()}
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t("刷新列表")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <RelayProfileList
          form={form}
          defaultContextSelection={emptyContextSelection}
          onEdit={(id) => {
            setNewProfileDraft(null);
            setDetailProfileId(
              form.relayProfiles.some((profile) => profile.id === id) ? id : null,
            );
          }}
          onFormChange={saveRelaySettings}
          disabled={!form.relayProfilesEnabled || actions.relaySwitching}
          actions={actions}
        />
      </CardContent>
    </Card>
  );
}
