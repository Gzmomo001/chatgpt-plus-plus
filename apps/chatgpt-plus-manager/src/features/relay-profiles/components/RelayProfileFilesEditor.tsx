import { Download } from "lucide-react";
import { useEffect,useRef,useState } from "react";

import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import {
  projectRelayFiles,
  promoteRelayCommonConfig,
} from "@/features/relay-profiles/config";
import { t } from "@/i18n";
import type {
  RelayProfileFilesActions,
  RelayProfileView,
  RelaySettings,
} from "../contracts";
import type { ReconciledRelayProfileSettings } from "../types";

type RelayProfileFilesEditorProps<Settings extends RelaySettings>={
  profile: RelayProfileView;
  form: Settings;
  isActive: boolean;
  onFormChange: (value: ReconciledRelayProfileSettings<Settings>) => void|Promise<void>;
  onProfileChange: (value: RelayProfileView) => void;
  actions: RelayProfileFilesActions<Settings>;
};

export function RelayProfileFilesEditor<Settings extends RelaySettings>({
  profile,
  form,
  isActive,
  onFormChange,
  onProfileChange,
  actions,
}: RelayProfileFilesEditorProps<Settings>) {
  const projection=projectRelayFiles(profile,form);

  const promoteCommonConfig=async () => {
    const extracted=await actions.extractRelayCommonConfig(
      profile.configContents||"",
    );
    if(!extracted) return;
    const promoted=promoteRelayCommonConfig(form,profile,extracted);
    if(
      !promoted.settings.relayCommonConfigContents.trim()
    ) {
      await actions.showMessage(
        t("通用配置文件"),
        t("当前供应商 config.toml 里没有可提取的通用配置。"),
        "failed",
      );
      return;
    }
    onFormChange(promoted.settings);
    onProfileChange(promoted.profile);
    await actions.saveSettingsValue(promoted.settings,false);
  };

  return (
    <div className="relay-file-grid">
      <div className="relay-file-panel">
        <FileHead
          title={t("config.toml 预览")}
          detail={isActive
            ? t("当前供应商管理部分的写入预览；Codex 原生扩展会保留且不在此显示")
            :t("切换到此供应商时的管理部分预览；Codex 原生扩展会保留且不在此显示")}
        />
        <SyncedTextarea
          className="relay-file-textarea"
          value={projection.configPreview}
          onValueChange={(value) => onProfileChange({
            ...profile,
            configContents: projection.profileConfigFromPreview(value),
          })}
        />
      </div>

      <div className="relay-file-panel">
        <div className="relay-file-head">
          <div>
            <strong>{t("通用配置文件")}</strong>
            <span>{t("跨供应商复用的 Codex 配置；MCP、Skills、Plugins 由 Codex 原生管理。")}</span>
          </div>
          <Button
            onClick={() => void promoteCommonConfig()}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Download className="h-4 w-4" />
            {t("提取当前供应商配置")}
          </Button>
        </div>
        <SyncedTextarea
          className="relay-file-textarea"
          value={form.relayCommonConfigContents}
          onValueChange={(value) => onFormChange({
            ...form,
            relayCommonConfigContents: value,
          })}
        />
      </div>

      <div className="relay-file-panel">
        <FileHead
          title="auth.json"
          detail={isActive
            ? t("当前使用中：打开时从 ~/.codex/auth.json 回填，保存后会作为此供应商 auth 存档")
            :t("切换到此供应商时会写入 ~/.codex/auth.json")}
        />
        <SyncedTextarea
          className="relay-file-textarea"
          value={profile.authContents}
          onValueChange={(value) => onProfileChange({
            ...profile,
            authContents: value,
          })}
        />
      </div>
    </div>
  );
}

function FileHead({ title,detail }: { title: string; detail: string; }) {
  return (
    <div className="relay-file-head">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function SyncedTextarea({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const [localValue,setLocalValue]=useState(value);
  const isFocusedRef=useRef(false);
  const latestExternalValueRef=useRef(value);

  useEffect(() => {
    latestExternalValueRef.current=value;
    if(!isFocusedRef.current) setLocalValue(value);
  },[value]);

  return (
    <Textarea
      className={className}
      value={localValue}
      onBlur={() => {
        isFocusedRef.current=false;
        setLocalValue(latestExternalValueRef.current);
      }}
      onChange={(event) => {
        const next=event.currentTarget.value;
        setLocalValue(next);
        onValueChange(next);
      }}
      onFocus={() => {
        isFocusedRef.current=true;
      }}
      spellCheck={false}
    />
  );
}
