import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { t } from "@/i18n";
import { Toolbar } from "@/shared/ui/layout";
import { RelayProfileEditor } from "./RelayProfileEditor";
import { RelayProfileFilesEditor } from "./RelayProfileFilesEditor";
import {
  ProviderCreationSelector,
  type ProviderCreationKind,
} from "./ProviderCreationSelector";
import { stripNativeExtensionTables } from "../config";
import { commitRelayChanges } from "../controller";
import { edit, open as openProfileEditor } from "../editor";
import type {
  CcsProvidersResult,
  RelayFilesResult,
  RelayProfileActions,
  RelayProfileView,
  RelaySettings,
} from "../contracts";
import type {
  RelayProfileEditableMode,
  RelayProfileEditorState,
  ReconciledRelayProfileSettings,
} from "../types";
const emptyContextSelection = { mcpServers: [], skills: [], plugins: [] };

export type RelayProfileSaveAction = {
  disabled: boolean;
  save: () => void;
};

export function RelayProfileDetail<Settings extends RelaySettings>({ profile, relayFiles, ccsProviders, form, isNew = false, onBack, onFormChange, onSaved, onSaveActionChange, actions }: {
  profile: RelayProfileView;
  relayFiles: RelayFilesResult | null;
  ccsProviders: CcsProvidersResult | null;
  form: Settings;
  isNew?: boolean;
  onBack: () => void;
  onFormChange: (value: ReconciledRelayProfileSettings<Settings>) => void | Promise<void>;
  onSaved?: () => void;
  onSaveActionChange?: (action: RelayProfileSaveAction | null) => void;
  actions: RelayProfileActions<Settings>;
}) {
  const isActive = !isNew && profile.id === form.activeRelayId;
  const openEditor = () => {
    const editableMode: RelayProfileEditableMode = profile.relayMode === "mixedApi" ? "official" : profile.relayMode;
    return openProfileEditor({
      settings: form,
      defaultContextSelection: emptyContextSelection,
      focus: isNew ? { type: "create", id: profile.id, name: profile.name, mode: editableMode } : { type: "existing", profileId: profile.id },
      liveFiles: isActive && relayFiles ? {
        configContents: stripNativeExtensionTables(relayFiles.configContents),
        authContents: relayFiles.authContents,
      } : null,
    });
  };
  const [editorState, setEditorState] = useState<RelayProfileEditorState>(openEditor);
  const [creationKind, setCreationKind] = useState<ProviderCreationKind>(
    profile.relayMode === "aggregate" ? "aggregate" : "standard",
  );
  useEffect(() => {
    setEditorState(openEditor());
    setCreationKind(profile.relayMode === "aggregate" ? "aggregate" : "standard");
  }, [profile.id, profile.modelList, profile.modelWindows, profile.relayMode, profile.officialMixApiKey, isActive, isNew, relayFiles?.configContents, relayFiles?.authContents]);
  const draft = editorState.preview.profile;
  const validationError = editorState.issues.find((issue) => issue.blocking)?.message ?? null;
  const saveDraft = async () => {
    const committed = commitRelayChanges(editorState, form);
    if (!committed.ok)
      return;
    if (committed.effect.type === "switchProfile")
      await actions.switchRelayProfile(committed.settings, committed.effect.profileId);
    else
      await onFormChange(committed.settings);
    onSaved?.();
  };
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  useEffect(() => {
    if (!isNew || creationKind === "import") {
      onSaveActionChange?.(null);
      return;
    }
    onSaveActionChange?.({
      disabled: Boolean(validationError),
      save: () => void saveDraftRef.current(),
    });
    return () => onSaveActionChange?.(null);
  }, [creationKind, isNew, onSaveActionChange, validationError]);
  const switchDraft = () => {
    if (isNew)
      return;
    const committed = commitRelayChanges(edit(editorState, { type: "activate", profileId: profile.id }), form);
    if (committed.ok && committed.effect.type === "switchProfile")
      void actions.switchRelayProfile(committed.settings, committed.effect.profileId);
  };
  const selectCreationKind = (kind: ProviderCreationKind) => {
    setCreationKind(kind);
    if (kind === "import")
      return;
    setEditorState((current) => edit(current, {
      type: "setMode",
      mode: kind === "aggregate"
        ? "aggregate"
        : current.draft.relayMode === "pureApi" ? "pureApi" : "official",
    }));
  };
  const creationSelector = isNew ? (
    <ProviderCreationSelector
      ccsProviders={ccsProviders}
      onImport={actions.importCcsProviders}
      onImported={onSaved ?? onBack}
      onRefresh={actions.refreshCcsProviders}
      onSelect={selectCreationKind}
      selected={creationKind}
    />
  ) : null;
  const navigationTitle = (
    <h2 className="relay-editor-title">
      <button onClick={onBack} title={t("返回列表")} type="button">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t("供应商管理")}
      </button>
    </h2>
  );
  return <div className="relay-detail-page" key={profile.id}>
    {!isNew ? <div className="relay-detail-sticky">
      <Toolbar>
        <Button onClick={onBack} variant="secondary">
          <ArrowLeft className="h-4 w-4" />{t("返回列表")}</Button>
        <Button disabled={!!validationError} onClick={() => void saveDraft()} title={validationError || t("保存")}>
          <Save className="h-4 w-4" />{t("保存")}</Button>
      </Toolbar>
    </div> : null}
    {creationKind === "import" ? <div className="relay-profile-editor provider-import-editor">
      <div className="relay-editor-head">
        <div>
          {navigationTitle}
          <span>{t("从第三方导入")}</span>
        </div>
      </div>
      {creationSelector}
    </div> : <RelayProfileEditor state={editorState} form={form} isNew={isNew} headerAddon={creationSelector} headerTitle={navigationTitle} onStateChange={setEditorState} onSwitch={switchDraft} actions={actions} />}
    {creationKind === "import" || editorState.draft.relayMode === "aggregate" ? null : (
      <RelayProfileFilesEditor
        profile={draft}
        form={form}
        isActive={isActive}
        onFormChange={onFormChange}
        onProfileChange={(next) => setEditorState((current) => edit(current, {
          type: "replaceStoredFiles",
          configContents: next.configContents,
          authContents: next.authContents,
        }))}
        actions={actions}
      />
    )}
  </div>;
}
