import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { t, tf } from "@/i18n";
import type { ImageOverlayFitMode } from "@/shared/contracts/settings";
import { Field } from "@/shared/ui/field";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";
import {
  clampNumber,
  normalizeImageOverlayFitMode,
} from "@/shared/lib/settings";

import {
  codexExtraArgsToInput,
  inputToCodexExtraArgs,
} from "./presentation";

export type SettingsForm = {
  relayTestModel: string;
  codexAppStepwiseBaseUrl: string;
  codexAppStepwiseApiKey: string;
  codexAppStepwiseApiKeyEnv: string;
  codexAppStepwiseModel: string;
  codexAppStepwiseMaxItems: number;
  codexAppStepwiseMaxInputChars: number;
  codexAppStepwiseMaxOutputTokens: number;
  codexAppStepwiseTimeoutMs: number;
  codexAppImageOverlayEnabled: boolean;
  codexAppImageOverlayPath: string;
  codexAppImageOverlayOpacity: number;
  codexAppImageOverlayFitMode: ImageOverlayFitMode;
  codexExtraArgs: string[];
};

export type SettingsActions<Form extends SettingsForm> = {
  toggleTheme: () => void;
  saveSettings: () => Promise<void>;
  resetImageOverlaySettings: () => Promise<void>;
  chooseImageOverlayPath: () => Promise<void>;
  testStepwiseSettings: (settings: Form) => Promise<void>;
};

export function SettingsScreen<Form extends SettingsForm>({
  settingsPath,
  theme,
  form,
  onFormChange,
  actions,
}: {
  settingsPath: string;
  theme: "dark" | "light";
  form: Form;
  onFormChange: (value: Form) => void;
  actions: SettingsActions<Form>;
}) {
  return (
    <>
      <Panel>
        <CardHead title={t("基础设置")} detail={settingsPath} />
        <CardContent>
          <div className="theme-row">
            <div>
              <strong>{t("界面主题")}</strong>
              <span>{t("当前为")}{theme === "dark" ? t("深色") : t("浅色")}{t("模式。")}</span>
            </div>
            <Button variant="secondary" onClick={actions.toggleTheme}>{t("切换主题")}</Button>
          </div>
          <Field label={t("供应商测试模型")}>
            <Input
              value={form.relayTestModel}
              onChange={(event) => onFormChange({ ...form, relayTestModel: event.currentTarget.value })}
              placeholder={t("例如 gpt-5.4-mini")}
            />
          </Field>
          <div className="settings-block stepwise-settings-block">
            <div className="section-title">Stepwise</div>
            <div className="stepwise-settings-section">{t("连接")}</div>
            <div className="form-row">
              <Field label="Base URL">
                <Input
                  value={form.codexAppStepwiseBaseUrl}
                  onChange={(event) => onFormChange({ ...form, codexAppStepwiseBaseUrl: event.currentTarget.value })}
                  placeholder="https://api.example.com/v1"
                />
              </Field>
              <Field label="Model">
                <Input
                  value={form.codexAppStepwiseModel}
                  onChange={(event) => onFormChange({ ...form, codexAppStepwiseModel: event.currentTarget.value })}
                  placeholder={t("例如 gpt-5.4-mini")}
                />
              </Field>
            </div>
            <Field label="API Key">
              <Input
                type="password"
                value={form.codexAppStepwiseApiKey}
                onChange={(event) => onFormChange({ ...form, codexAppStepwiseApiKey: event.currentTarget.value })}
              />
            </Field>
            <details className="stepwise-advanced">
              <summary>{t("高级参数")}</summary>
              <div className="form-row">
                <Field label={t("API Key 环境变量")}>
                  <Input
                    value={form.codexAppStepwiseApiKeyEnv}
                    onChange={(event) => onFormChange({ ...form, codexAppStepwiseApiKeyEnv: event.currentTarget.value })}
                  />
                </Field>
                <Field label={t("最多建议数")}>
                  <Input
                    max={6}
                    min={0}
                    type="number"
                    value={form.codexAppStepwiseMaxItems}
                    onChange={(event) =>
                      onFormChange({ ...form, codexAppStepwiseMaxItems: clampNumber(Number(event.currentTarget.value), 0, 6) })
                    }
                  />
                </Field>
              </div>
              <div className="form-row">
                <Field label={t("超时毫秒")}>
                  <Input
                    min={1000}
                    type="number"
                    value={form.codexAppStepwiseTimeoutMs}
                    onChange={(event) =>
                      onFormChange({ ...form, codexAppStepwiseTimeoutMs: clampNumber(Number(event.currentTarget.value), 1000, 60000) })
                    }
                  />
                </Field>
                <Field label={t("最大输入字符")}>
                  <Input
                    min={1000}
                    type="number"
                    value={form.codexAppStepwiseMaxInputChars}
                    onChange={(event) =>
                      onFormChange({ ...form, codexAppStepwiseMaxInputChars: clampNumber(Number(event.currentTarget.value), 1000, 24000) })
                    }
                  />
                </Field>
              </div>
              <Field label={t("最大输出 tokens")}>
                <Input
                  min={100}
                  type="number"
                  value={form.codexAppStepwiseMaxOutputTokens}
                  onChange={(event) =>
                    onFormChange({ ...form, codexAppStepwiseMaxOutputTokens: clampNumber(Number(event.currentTarget.value), 100, 4000) })
                  }
                />
              </Field>
            </details>
            <div className="toolbar stepwise-settings-actions">
              <Button variant="secondary" onClick={() => void actions.testStepwiseSettings(form)}>{t("测试连接")}</Button>
              <Button onClick={() => void actions.saveSettings()}>{t("保存设置")}</Button>
            </div>
          </div>
          <div className="settings-block">
            <label className="check-row">
              <input
                checked={form.codexAppImageOverlayEnabled}
                onChange={(event) =>
                  onFormChange({ ...form, codexAppImageOverlayEnabled: event.currentTarget.checked })
                }
                type="checkbox"
              />
              <span>{t("启用 Codex 图片覆盖层")}</span>
            </label>
            <div className="form-row">
              <Field label={t("覆盖图片")}>
                <Input
                  value={form.codexAppImageOverlayPath}
                  onChange={(event) => onFormChange({ ...form, codexAppImageOverlayPath: event.currentTarget.value })}
                  placeholder={t("选择 png / jpg / webp / gif / bmp")}
                />
              </Field>
              <Toolbar>
                <Button variant="secondary" onClick={() => void actions.chooseImageOverlayPath()}>
                  {t("选择图片")}
                </Button>
              </Toolbar>
            </div>
            <Field label={tf("透明度 {0}%", [form.codexAppImageOverlayOpacity])}>
              <Input
                min={1}
                max={100}
                type="range"
                value={form.codexAppImageOverlayOpacity}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    codexAppImageOverlayOpacity: clampNumber(Number(event.currentTarget.value), 1, 100),
                  })
                }
              />
            </Field>
            <Field label={t("背景适配方式")}>
              <select
                className="select-input"
                value={form.codexAppImageOverlayFitMode}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    codexAppImageOverlayFitMode: normalizeImageOverlayFitMode(event.currentTarget.value),
                  })
                }
              >
                <option value="fill">{t("填充")}</option>
                <option value="fit">{t("适应")}</option>
                <option value="stretch">{t("拉伸")}</option>
                <option value="tile">{t("平铺")}</option>
                <option value="center">{t("居中")}</option>
              </select>
            </Field>
          </div>
          <Toolbar>
            <Button onClick={() => void actions.saveSettings()}>{t("保存设置")}</Button>
            <Button variant="secondary" onClick={() => void actions.resetImageOverlaySettings()}>
              {t("重置背景")}
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("Codex 启动参数")} detail={t("启动 Codex App 时追加到默认 CDP 参数后。留空则保持默认启动行为。")} />
        <CardContent>
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
          <Toolbar>
            <Button onClick={() => void actions.saveSettings()}>{t("保存设置")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}
