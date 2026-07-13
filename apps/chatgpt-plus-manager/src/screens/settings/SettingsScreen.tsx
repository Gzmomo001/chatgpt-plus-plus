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
};

export type SettingsActions = {
  toggleTheme: () => void;
  saveSettings: () => Promise<void>;
};

export function SettingsScreen({
  settingsPath,
  theme,
  form,
  onFormChange,
  actions,
}: {
  settingsPath: string;
  theme: "dark" | "light";
  form: SettingsForm;
  onFormChange: (value: SettingsForm) => void;
  actions: SettingsActions;
}) {
  return (
    <Panel>
      <CardHead title={t("偏好设置")} detail={settingsPath} />
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
        <Toolbar>
          <Button onClick={() => void actions.saveSettings()}>{t("保存设置")}</Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}
