import { Plus, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { EnvConflictNotice } from "@/features/relay-profiles/components/RelayFeedback";
import {
  RelayProfileDetail,
  type RelayProfileSaveAction,
} from "@/features/relay-profiles/components/RelayProfileDetail";
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
import type { ReconciledRelayProfileSettings } from "@/features/relay-profiles/types";
import { t, tf } from "@/i18n";

const emptyContextSelection = { mcpServers: [], skills: [], plugins: [] };

type RelayProfilesScreenProps<Settings extends RelaySettings> = {
  relayFiles: RelayFilesResult | null;
  envConflicts: EnvConflictsResult | null;
  ccsProviders: CcsProvidersResult | null;
  form: Settings;
  navbarActionHost: HTMLElement | null;
  createRequest: number;
  onFormChange: (value: ReconciledRelayProfileSettings<Settings>) => void;
  actions: RelayProfileActions<Settings>;
};

export function RelayProfilesScreen<Settings extends RelaySettings>({
  relayFiles,
  envConflicts,
  ccsProviders,
  form,
  navbarActionHost,
  createRequest,
  onFormChange,
  actions,
}: RelayProfilesScreenProps<Settings>) {
  const [detailProfileId, setDetailProfileId] = useState<string | null>(null);
  const [newProfileDraft, setNewProfileDraft] = useState<RelayProfileView | null>(null);
  const [newProfileSaveAction, setNewProfileSaveAction] = useState<RelayProfileSaveAction | null>(null);
  const refreshRelayFilesRef = useRef(actions.refreshRelayFiles);
  const handledCreateRequestRef = useRef(createRequest);
  const detailProfile = newProfileDraft
    ?? form.relayProfiles.find((profile) => profile.id === detailProfileId)
    ?? null;
  const isNewProfile = newProfileDraft !== null;

  const saveRelaySettings = async (next: ReconciledRelayProfileSettings<Settings>) => {
    onFormChange(next);
    await actions.saveSettingsValue(next, true);
  };

  const createProfile = () => openProfileEditor({
    settings: form,
    defaultContextSelection: emptyContextSelection,
    focus: {
      type: "create",
      id: `relay-${Date.now().toString(36)}`,
      name: tf("供应商 {0}", [form.relayProfiles.length + 1]),
      mode: "official",
    },
  }).preview.profile;

  const registerNewProfileSaveAction = useCallback((action: RelayProfileSaveAction | null) => {
    setNewProfileSaveAction(action);
  }, []);

  useEffect(() => {
    if (createRequest <= handledCreateRequestRef.current) return;
    handledCreateRequestRef.current = createRequest;
    setNewProfileSaveAction(null);
    setNewProfileDraft(createProfile());
    setDetailProfileId(null);
  }, [createRequest]);

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

  const navbarCreateAction = navbarActionHost
    ? createPortal(
        <Button
          aria-label={isNewProfile ? t("保存") : t("添加供应商")}
          className={`provider-create-trigger ${isNewProfile ? "active" : ""}`}
          disabled={isNewProfile && (!newProfileSaveAction || newProfileSaveAction.disabled)}
          onClick={() => {
            if (isNewProfile) {
              newProfileSaveAction?.save();
              return;
            }
            setNewProfileSaveAction(null);
            setNewProfileDraft(createProfile());
            setDetailProfileId(null);
          }}
          size="icon"
          title={isNewProfile ? t("保存") : t("添加供应商")}
          variant="ghost"
        >
          {isNewProfile ? <Save className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
        </Button>,
        navbarActionHost,
      )
    : null;

  if (detailProfile) {
    return (
      <>
        {navbarCreateAction}
        <RelayProfileDetail
          profile={detailProfile}
          relayFiles={!isNewProfile && detailProfile.id === form.activeRelayId
            ? relayFiles
            : null}
          form={form}
          isNew={isNewProfile}
          ccsProviders={ccsProviders}
          onBack={() => {
            setNewProfileSaveAction(null);
            setNewProfileDraft(null);
            setDetailProfileId(null);
          }}
          onSaveActionChange={registerNewProfileSaveAction}
          onFormChange={saveRelaySettings}
          onSaved={() => {
            setNewProfileSaveAction(null);
            setNewProfileDraft(null);
            setDetailProfileId(null);
          }}
          actions={actions}
        />
      </>
    );
  }

  return (
    <>
      {navbarCreateAction}
      <Card className="panel relay-list-panel">
        <CardHeader className="panel-head">
          <CardTitle>{t("供应商列表")}</CardTitle>
          <CardDescription>
            {tf("{0} 个供应商配置；可拖动排序，点编辑进入详情", [form.relayProfiles.length])}
          </CardDescription>
        </CardHeader>
        <CardContent className="relay-list-content">
          <EnvConflictNotice envConflicts={envConflicts} actions={actions} />
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
            disabled={actions.relaySwitching}
            actions={actions}
          />
        </CardContent>
      </Card>
    </>
  );
}
