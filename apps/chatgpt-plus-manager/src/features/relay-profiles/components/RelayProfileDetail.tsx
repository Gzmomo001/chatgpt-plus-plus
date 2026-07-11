import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useState } from "react";
import type { ContextEntries } from "@/features/context/config";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { Toolbar } from "@/shared/ui/layout";
import { RelayProfileEditor } from "./RelayProfileEditor";
import { RelayProfileFilesEditor } from "./RelayProfileFilesEditor";
import { commitRelayChanges } from "../controller";
import { edit, open as openProfileEditor } from "../editor";
import type {
  RelayFilesResult,
  RelayProfileActions,
  RelayProfileView,
  RelaySettings,
} from "../contracts";
import type {
  RelayContextSelection,
  RelayProfileEditableMode,
  RelayProfileEditorState,
  ReconciledRelayProfileSettings,
} from "../types";
export function RelayProfileDetail<Settings extends RelaySettings>({ profile, relayFiles, form, contextEntries, defaultContextSelection, isNew = false, onBack, onFormChange, onSaved, actions }: {
  profile: RelayProfileView;
  relayFiles: RelayFilesResult | null;
  form: Settings;
  contextEntries: ContextEntries;
  defaultContextSelection: RelayContextSelection;
  isNew?: boolean;
  onBack: () => void;
  onFormChange: (value: ReconciledRelayProfileSettings<Settings>) => void | Promise<void>;
  onSaved?: () => void;
  actions: RelayProfileActions<Settings>;
}) {
  const isActive = !isNew && profile.id === form.activeRelayId;
  const openEditor = () => {
    const editableMode: RelayProfileEditableMode = profile.relayMode === "mixedApi" ? "official" : profile.relayMode;
    return openProfileEditor({
      settings: form,
      defaultContextSelection,
      focus: isNew ? { type: "create", id: profile.id, name: profile.name, mode: editableMode } : { type: "existing", profileId: profile.id },
      liveFiles: isActive && relayFiles ? { configContents: relayFiles.configContents, authContents: relayFiles.authContents } : null,
    });
  };
  const [editorState, setEditorState] = useState<RelayProfileEditorState>(openEditor);
  useEffect(() => { setEditorState(openEditor()); }, [profile.id, profile.modelList, profile.modelWindows, profile.relayMode, profile.officialMixApiKey, isActive, isNew, relayFiles?.configContents, relayFiles?.authContents]);
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
  const switchDraft = () => {
    if (isNew || !form.relayProfilesEnabled)
      return;
    const committed = commitRelayChanges(edit(editorState, { type: "activate", profileId: profile.id }), form);
    if (committed.ok && committed.effect.type === "switchProfile")
      void actions.switchRelayProfile(committed.settings, committed.effect.profileId);
  };
  return <div className="relay-detail-page" key={profile.id}>
    <div className="relay-detail-sticky">
      <Toolbar>
        <Button onClick={onBack} variant="secondary">
          <ArrowLeft className="h-4 w-4" />{t("返回列表")}</Button>
        <Button disabled={!!validationError} onClick={() => void saveDraft()} title={validationError || t("保存")}>
          <Save className="h-4 w-4" />{t("保存")}</Button>
      </Toolbar>
    </div>
    <RelayProfileEditor state={editorState} form={form} isNew={isNew} onStateChange={setEditorState} onSwitch={switchDraft} actions={actions} />
    {editorState.draft.relayMode === "aggregate" ? null : (
      <RelayProfileFilesEditor
        contextProfile={profile}
        profile={draft}
        form={form}
        contextEntries={contextEntries}
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
