import { FolderOpen } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { t } from "@/i18n";
import { Field } from "@/shared/ui/field";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";

import {
  codexExtraArgsToInput,
  inputToCodexExtraArgs,
} from "./presentation";

export type SettingsForm = {
  relayTestModel: string;
  codexExtraArgs: string[];
  diagnosticLogEnabled: boolean;
};

export type SettingsActions = {
  saveSettings: () => Promise<void>;
  openLogFolder: () => Promise<void>;
};

export function SettingsScreen({
  settingsPath,
  logPath,
  form,
  onFormChange,
  actions,
}: {
  settingsPath: string;
  logPath: string;
  form: SettingsForm;
  onFormChange: (value: SettingsForm) => void;
  actions: SettingsActions;
}) {
  return (
    <Panel>
      <CardHead title={t("偏好设置")} detail={settingsPath} />
      <CardContent>
        <Field label={t("供应商测试模型")}>
          <Input
            value={form.relayTestModel}
            onChange={(event) => onFormChange({ ...form, relayTestModel: event.currentTarget.value })}
            placeholder={t("例如 gpt-5.4-mini")}
          />
        </Field>
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
        <section className="feature-group">
          <div className="feature-group-head">
            <strong>{t("日志记录")}</strong>
            <small>{t("控制 ChatGPT++ 的运行诊断日志；关闭后不再写入 chatgpt-plus.log。")}</small>
          </div>
          <label className="switch-row compact">
            <span>
              <strong>{t("启用日志记录")}</strong>
              <small>{form.diagnosticLogEnabled ? t("正在记录运行诊断信息") : t("日志记录已关闭")}</small>
            </span>
            <input
              aria-label={t("启用日志记录")}
              checked={form.diagnosticLogEnabled}
              onChange={(event) => onFormChange({ ...form, diagnosticLogEnabled: event.currentTarget.checked })}
              type="checkbox"
            />
          </label>
          <div className="log-folder-row">
            <span className="log-folder-path" title={logPath}>
              {logPath || t("日志路径将在加载后显示")}
            </span>
            <Button onClick={() => void actions.openLogFolder()} variant="secondary">
              <FolderOpen className="h-4 w-4" />
              {t("打开日志文件夹")}
            </Button>
          </div>
        </section>
        <Toolbar>
          <Button onClick={() => void actions.saveSettings()}>{t("保存设置")}</Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}
