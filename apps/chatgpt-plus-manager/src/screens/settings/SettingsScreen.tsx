import { FolderOpen } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { t, tf } from "@/i18n";
import { Field } from "@/shared/ui/field";
import { CardHead, Panel } from "@/shared/ui/layout";

import {
  codexExtraArgsToInput,
  inputToCodexExtraArgs,
  providerTestModelOptions,
} from "./presentation";

export type SettingsForm = {
  relayTestModel: string;
  codexExtraArgs: string[];
  diagnosticLogEnabled: boolean;
};

export type SettingsActions = {
  openLogFolder: () => Promise<void>;
};

export type SettingsAutosaveState = "idle" | "pending" | "saving" | "saved" | "failed";

export type ProviderTestModelsView = {
  state: "idle" | "loading" | "ready" | "empty" | "failed";
  models: string[];
  attemptedProviders: number;
  successfulProviders: number;
};

export function SettingsScreen({
  settingsPath,
  logPath,
  form,
  autosaveState,
  providerTestModels,
  onFormChange,
  actions,
}: {
  settingsPath: string;
  logPath: string;
  form: SettingsForm;
  autosaveState: SettingsAutosaveState;
  providerTestModels: ProviderTestModelsView;
  onFormChange: (value: SettingsForm) => void;
  actions: SettingsActions;
}) {
  const testModelOptions = providerTestModelOptions(
    providerTestModels.models,
    form.relayTestModel,
  );
  return (
    <Panel>
      <CardHead title={t("偏好设置")} detail={settingsPath} />
      <CardContent>
        <Field label={t("供应商测试模型")}>
          <Input
            autoComplete="off"
            list="provider-test-model-options"
            value={form.relayTestModel}
            onChange={(event) => onFormChange({ ...form, relayTestModel: event.currentTarget.value })}
            placeholder={t("例如 gpt-5.4-mini")}
          />
          <datalist id="provider-test-model-options">
            {testModelOptions.map((model) => <option key={model} value={model} />)}
          </datalist>
          <span className="field-hint provider-test-model-status" data-state={providerTestModels.state}>
            {providerTestModelsMessage(providerTestModels)}
          </span>
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
        <div className="settings-autosave-status" data-state={autosaveState} role="status" aria-live="polite">
          <span aria-hidden="true" />
          {settingsAutosaveMessage(autosaveState)}
        </div>
      </CardContent>
    </Panel>
  );
}

function providerTestModelsMessage(view: ProviderTestModelsView): string {
  if (view.state === "loading") return t("正在从已接入供应商拉取模型列表…");
  if (view.state === "failed") return t("暂时无法从供应商获取模型；保留当前值，也可以手动输入。");
  if (view.state === "empty") return t("尚无可拉取模型的 API 供应商；仍可手动输入。");
  if (view.state === "ready") {
    return tf("已自动汇总 {0} 个模型（成功 {1}/{2} 个供应商）；仍可手动输入。", [
      view.models.length,
      view.successfulProviders,
      view.attemptedProviders,
    ]);
  }
  return t("进入此页面后会自动汇总所有已接入供应商的模型；仍可手动输入。");
}

function settingsAutosaveMessage(state: SettingsAutosaveState): string {
  if (state === "pending") return t("等待自动保存…");
  if (state === "saving") return t("正在自动保存…");
  if (state === "saved") return t("所有更改均已自动保存");
  if (state === "failed") return t("自动保存失败；请检查设置后再次修改。");
  return t("更改会自动保存");
}
