import { AppWindow, FolderOpen } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { t } from "@/i18n";
import { Field } from "@/shared/ui/field";
import { SettingsCard } from "@/shared/ui/layout";

import {
  codexExtraArgsToInput,
  inputToCodexExtraArgs,
} from "./presentation";

export type SettingsForm = {
  codexExtraArgs: string[];
  diagnosticLogEnabled: boolean;
};

export type SettingsActions = {
  chooseChatGptAppPath: () => Promise<void>;
  openLogFolder: () => Promise<void>;
  setDiagnosticLogEnabled: (enabled: boolean) => void;
};

export function SettingsScreen({
  settingsPath,
  chatGptAppPath,
  form,
  onFormChange,
  actions,
}: {
  settingsPath: string;
  chatGptAppPath: string;
  form: SettingsForm;
  onFormChange: (value: SettingsForm) => void;
  actions: SettingsActions;
}) {
  return (
    <SettingsCard title={t("偏好设置")} detail={settingsPath}>
      <div className="chatgpt-app-path-setting">
        <div className="chatgpt-app-path-copy">
          <strong>{t("ChatGPT 路径")}</strong>
          <code className="chatgpt-app-path-value" title={chatGptAppPath || t("未检测到")}>
            {chatGptAppPath || t("未检测到")}
          </code>
        </div>
        <Button onClick={() => void actions.chooseChatGptAppPath()} variant="secondary">
          <AppWindow className="h-4 w-4" />
          {t("选择应用")}
        </Button>
      </div>
      <section className="feature-group">
        <div className="feature-group-head">
          <strong>{t("Codex 启动参数")}</strong>
          <small>{t("启动官方 Codex App 时追加这些参数；留空则保持官方默认启动行为。")}</small>
        </div>
        <Field label={t("额外参数")}>
          <Textarea
            className="launch-args-input"
            placeholder="--force_high_performance_gpu"
            spellCheck={false}
            value={codexExtraArgsToInput(form.codexExtraArgs)}
            onChange={(event) =>
              onFormChange({
                ...form,
                codexExtraArgs: inputToCodexExtraArgs(event.currentTarget.value),
              })
            }
          />
        </Field>
        <p className="field-hint">{t("每行一个参数，例如 --force_high_performance_gpu。不需要填写 open 或 --args。")}</p>
      </section>
      <div className="diagnostic-log-setting">
        <div className="diagnostic-log-row">
          <div className="diagnostic-log-copy">
            <label htmlFor="diagnostic-log-enabled">
              <strong>{t("日志记录")}</strong>
            </label>
          </div>
          <div className="diagnostic-log-actions">
            <Button onClick={() => void actions.openLogFolder()} variant="secondary">
              <FolderOpen className="h-4 w-4" />
              {t("打开日志文件夹")}
            </Button>
            <input
              aria-label={t("启用日志记录")}
              checked={form.diagnosticLogEnabled}
              className="diagnostic-log-switch"
              id="diagnostic-log-enabled"
              onChange={(event) => actions.setDiagnosticLogEnabled(event.currentTarget.checked)}
              type="checkbox"
            />
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
