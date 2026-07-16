import { Check, Download, MessageCircle, Plus, Settings, ShieldCheck, Stethoscope, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Badge as UiBadge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { t, tf } from "@/i18n";
import { Field } from "@/shared/ui/field";
import { Metric } from "@/shared/ui/metric";
import { ProviderPresetSelector } from "./ProviderPresetSelector";
import { RelayProfileCombobox } from "./RelayProfileCombobox";
import { ProviderDoctorModal } from "./RelayFeedback";
import { runProviderDiagnosis } from "../controller";
import { commit, edit } from "../editor";
import { aggregateStrategyHelp, aggregateStrategyLabel, configHasCodexGoalsFeature, getAggregateStrategyOptions, relayModeLabel, relayProfileConfigBrief, relayProfileEditorStatus, relayProfileModeHelp, relayProtocolLabel, setCodexGoalsFeatureInConfig } from "../presentation";
import type { ProviderDoctorResult, RelayProfileActions, RelaySettings } from "../contracts";
import type { ApplyRelayProfilePresetIntent, ModelWindowRow, RelayAggregateStrategy, RelayProfileEditableMode, RelayProfileEditorState, RelayProfilePatch } from "../types";

export function RelayProfileEditor<Settings extends RelaySettings>({ state, form, isNew = false, headerAddon, headerTitle, onStateChange, onSwitch, actions }: {
  state: RelayProfileEditorState;
  form: Settings;
  isNew?: boolean;
  headerAddon?: ReactNode;
  headerTitle: ReactNode;
  onStateChange: (value: RelayProfileEditorState) => void;
  onSwitch: () => void;
  actions: RelayProfileActions<Settings>;
}) {
  const profile = state.preview.profile;
  const modelWindowRows = state.draft.models;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [doctorResult, setDoctorResult] = useState<ProviderDoctorResult | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [doctorRunning, setDoctorRunning] = useState(false);
  if (state.draft.relayMode === "aggregate")
    return <AggregateRelayProfileEditor state={state} isNew={isNew} headerAddon={headerAddon} headerTitle={headerTitle} onStateChange={onStateChange} />;
  const editableMode: RelayProfileEditableMode = profile.relayMode === "pureApi" ? "pureApi" : "official";
  const showApiFields = profile.relayMode !== "official" || profile.officialMixApiKey;
  const updateDraft = (patch: RelayProfilePatch) => onStateChange(edit(state, { type: "patch", patch }));
  const runProviderDoctor = async () => {
    setDoctorOpen(true);
    const committed = commit(state);
    await runProviderDiagnosis(committed.ok ? committed.profile : profile, actions.diagnoseRelayProfile, (transition) => {
      setDoctorRunning(transition.running);
      if ("result" in transition)
        setDoctorResult(transition.result ?? null);
    });
  };
  return <div className="relay-profile-editor">
    <div className="relay-editor-head">
      <div>
        {headerTitle}
        <span>{relayProfileEditorStatus(profile, form, isNew)}</span>
      </div>
      {isNew ? null : profile.id === form.activeRelayId ? (
        <span className="relay-active-status">
          <Check aria-hidden="true" className="h-4 w-4" />
          {t("当前")}
        </span>
      ) : (
        <Button
          disabled={actions.relaySwitching}
          onClick={onSwitch}
          title={actions.relaySwitching ? t("供应商切换中") : undefined}
          variant="default"
        >
          {actions.relaySwitching ? t("切换中") : t("设为当前")}
        </Button>
      )}
    </div>
    {headerAddon}
    {isNew ? <ProviderPresetSelector onSelect={(intent: ApplyRelayProfilePresetIntent) => onStateChange(edit(state, intent))} /> : null}
    <div className="relay-fields">
      <Field className="relay-field-name" label={t("名称")}>
        <Input value={profile.name} onChange={(event) => updateDraft({ name: event.currentTarget.value })} />
      </Field>
      <Field className="relay-field-mode" label={t("接入模式")}>
        <RelayProfileCombobox
          ariaLabel={t("接入模式")}
          onChange={(mode) => onStateChange(edit(state, { type: "setMode", mode }))}
          options={[
            { value: "official" as const, label: t("官方登录") },
            { value: "pureApi" as const, label: t("纯 API") },
          ]}
          value={editableMode}
        />
      </Field>
      <Field className="relay-field-config-model" label={t("配置模型")}>
        <Input value={profile.model} onChange={(event) => updateDraft({ model: event.currentTarget.value })} placeholder={t("例如 deepseek-v4-pro")} />
        <p className="field-hint">{t("默认启动 Codex 时使用的模型名，请勿带后缀；上下文窗口请在下方「模型列表」中按模型单独配置。")}</p>
      </Field>
      <Field className="relay-field-goals" label={t("Codex 目标")}>
        <label className="inline-check">
          <input checked={configHasCodexGoalsFeature(profile.configContents)} onChange={(event) => updateDraft({ configContents: setCodexGoalsFeatureInConfig(profile.configContents, event.currentTarget.checked) })} type="checkbox" />
          <span>{t("启用目标功能")}</span>
        </label>
      </Field>
      <div className="relay-advanced-toggle">
        <Button aria-expanded={showAdvanced} onClick={() => setShowAdvanced((current) => !current)} size="sm" type="button" variant="secondary">
          <Settings className="h-4 w-4" />{t("更多选项")}</Button>
      </div>
      {showAdvanced ? <div className="relay-advanced-fields">
        <Field className="relay-field-context-window" label={t("上下文大小")}>
          <Input inputMode="numeric" value={profile.contextWindow} onChange={(event) => updateDraft({ contextWindow: event.currentTarget.value.replace(/[^\d]/g, "") })} placeholder={t("留空不改写，例如 200000")} />
        </Field>
        <Field className="relay-field-auto-compact" label={t("压缩上下文大小")}>
          <Input inputMode="numeric" value={profile.autoCompactLimit} onChange={(event) => updateDraft({ autoCompactLimit: event.currentTarget.value.replace(/[^\d]/g, "") })} placeholder={t("留空不改写，例如 160000")} />
        </Field>
      </div> : null}
      {profile.relayMode === "official" ? <Field className="relay-field-official-key" label="API Key">
        <label className="inline-check">
          <input checked={profile.officialMixApiKey} onChange={(event) => updateDraft({ officialMixApiKey: event.currentTarget.checked })} type="checkbox" />
          <span>{t("混入 API KEY")}</span>
        </label>
      </Field> : null}
      {showApiFields ? <div className="relay-api-fields">
        <Field className="relay-field-base-url" label="Base URL">
          <Input value={profile.baseUrl} onChange={(event) => updateDraft({ baseUrl: event.currentTarget.value })} placeholder={t("填写中转服务 Base URL")} />
        </Field>
        <Field className="relay-field-key" label="Key">
          <Input type="password" value={profile.apiKey} onChange={(event) => updateDraft({ apiKey: event.currentTarget.value })} placeholder={t("输入中转服务的 API Key")} />
        </Field>
        <Field className="relay-field-protocol" label={t("上游协议")}>
          <div className="protocol-options">
            <button className={`protocol-option ${profile.protocol === "responses" ? "active" : ""}`} onClick={() => updateDraft({ protocol: "responses" })} type="button">Responses API</button>
            <button className={`protocol-option ${profile.protocol === "chatCompletions" ? "active" : ""}`} onClick={() => updateDraft({ protocol: "chatCompletions" })} type="button">Chat Completions</button>
          </div>
        </Field>
        <Field className="relay-field-native-image-generation" label={t("实验性功能")}>
          <label className="inline-check">
            <input
              checked={profile.nativeImageGenerationEnabled}
              disabled={profile.protocol !== "responses" || profile.relayMode !== "pureApi"}
              onChange={(event) => updateDraft({ nativeImageGenerationEnabled: event.currentTarget.checked })}
              type="checkbox"
            />
            <span>{t("启用 Codex 原生图片生成")}</span>
          </label>
          <p className="field-hint">{t("上游必须同时兼容 /v1/responses、/v1/images/generations、gpt-image-2，并返回 data[].b64_json；仅在 /v1/models 中出现 gpt-image-2 不能证明兼容。")}</p>
          {profile.protocol !== "responses" ? <p className="field-hint">{t("Chat Completions 依赖本地协议代理；当前版本不代理图片生成路径，因此不能启用此功能。")}</p> : null}
          {profile.relayMode !== "pureApi" ? <p className="field-hint">{t("此实验性功能仅用于纯 API 供应商，不会修改官方 ChatGPT 登录模式。")}</p> : null}
        </Field>
      </div> : null}
      {showApiFields ? <div className="provider-doctor">
        <div className="provider-doctor-head">
          <div>
            <strong>Provider Doctor</strong>
            <span>{t("检查配置、模型列表和一次真实请求，定位供应商不可用原因。")}</span>
          </div>
          <Button onClick={() => void runProviderDoctor()} size="sm" type="button" variant="secondary">
            <Stethoscope className="h-4 w-4" />{t("诊断供应商")}</Button>
        </div>
        <span>{doctorResult?.summary ?? t("点击后会打开诊断弹框，按步骤检查供应商。")}</span>
        <span>{t("上游列出图像模型不代表 Codex 已注册原生 image_gen；Provider Doctor 会明确报告这项能力边界。")}</span>
      </div> : null}
      {showApiFields ? <Field className="relay-field-model-list" label={t("模型列表")}>
        <div className="relay-model-row-editor">
          <div className="relay-model-row relay-model-row-head">
            <span>{t("模型名称")}</span>
            <span>{t("上下文窗口")}</span>
            <span>{t("推理档位")}</span>
            <span>{t("默认推理")}</span>
            <span />
          </div>{modelWindowRows.map((row, index) => <div className="relay-model-row" key={`${index}-${row.model}`}>
            <Input value={row.model} onChange={(event) => onStateChange(edit(state, { type: "replaceModels", models: modelWindowRows.map((item, rowIndex) => rowIndex === index ? { ...item, model: event.currentTarget.value } : item) }))} placeholder="deepseek/deepseek-v4-flash" />
            <Input value={row.window} onChange={(event) => onStateChange(edit(state, { type: "replaceModels", models: modelWindowRows.map((item, rowIndex) => rowIndex === index ? { ...item, window: event.currentTarget.value } : item) }))} placeholder="1M" />
            <Input value={row.reasoningSupported ?? ""} onChange={(event) => onStateChange(edit(state, { type: "replaceModels", models: modelWindowRows.map((item, rowIndex) => rowIndex === index ? { ...item, reasoningSupported: event.currentTarget.value } : item) }))} placeholder="low, medium, high" />
            <Input value={row.reasoningDefault ?? ""} onChange={(event) => onStateChange(edit(state, { type: "replaceModels", models: modelWindowRows.map((item, rowIndex) => rowIndex === index ? { ...item, reasoningDefault: event.currentTarget.value } : item) }))} placeholder="medium" />
            <Button aria-label={t("删除模型")} onClick={() => onStateChange(edit(state, { type: "removeModel", model: modelWindowRows[index]?.model ?? "" }))} size="icon" title={t("删除模型")} type="button" variant="ghost">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>)}</div>
        <div className="relay-model-list-tools">
          <Button onClick={() => onStateChange(edit(state, { type: "replaceModels", models: [...modelWindowRows, { model: "", window: "" }] }))} size="sm" type="button" variant="secondary">
            <Plus className="h-4 w-4" />{t("添加模型")}</Button>
          <Button onClick={async () => {
            const models = await actions.fetchRelayProfileModels(state.preview.profile);
            if (models?.length)
              onStateChange(edit(state, { type: "mergeModels", models: models.map((model): ModelWindowRow => ({ model, window: "" })) }));
          }} size="sm" type="button" variant="secondary">
            <Download className="h-4 w-4" />{t("从上游获取")}</Button>
        </div>
        <p className="field-hint">{t("每行一个模型；上下文窗口可填")} <code>1M</code>{t("、")}<code>200K</code> {t("或")} <code>1000000</code>{t("，留空表示使用 Codex 默认长度。推理档位用英文逗号分隔；留空时不会向模型声明 reasoning 支持。")}</p>
        <p className="field-hint">{t("上游接口不可用时，仍可使用「添加模型」手动配置。")}</p>
      </Field> : null}
      {showApiFields ? <Field className="relay-field-user-agent" label="User-Agent">
        <Input value={profile.userAgent} onChange={(event) => updateDraft({ userAgent: event.currentTarget.value })} placeholder={t("留空使用默认值")} />
      </Field> : null}
    </div>
    {showApiFields && profile.protocol === "chatCompletions" ? <div className="hint-line relay-protocol-hint">
      <MessageCircle className="h-4 w-4" />
      <span>{t("此上游会通过本地 127.0.0.1:57321 转成 Responses API，需要从 ChatGPT++ 启动 Codex。")}</span>
    </div> : null}
    <div className="hint-line relay-protocol-hint">
      <ShieldCheck className="h-4 w-4" />
      <span>{relayProfileModeHelp(profile)}</span>
    </div>
    {doctorOpen ? <ProviderDoctorModal result={doctorResult} running={doctorRunning} onClose={() => {
      if (!doctorRunning)
        setDoctorOpen(false);
    }} /> : null}
  </div>;
}
function AggregateRelayProfileEditor({ state, isNew = false, headerAddon, headerTitle, onStateChange }: {
  state: RelayProfileEditorState;
  isNew?: boolean;
  headerAddon?: ReactNode;
  headerTitle: ReactNode;
  onStateChange: (value: RelayProfileEditorState) => void;
}) {
  const profile = state.preview.profile;
  const candidates = state.semantic.aggregateCandidates;
  const aggregate = state.draft.aggregate ?? { strategy: "failover", members: [] };
  const aggregateStrategyOptions = getAggregateStrategyOptions();
  const memberIds = new Set(aggregate.members.map((member) => member.profileId));
  return <div className="relay-profile-editor aggregate-editor">
    <div className="relay-editor-head">
      <div>
        {headerTitle}
        <span>{isNew ? t("选择已有供应商作为成员，保存后写入 settings payload") : t("聚合配置只引用已有供应商，不复制 Key 和配置文件")}</span>
      </div>
      <UiBadge variant="secondary">{t("聚合")}</UiBadge>
    </div>
    {headerAddon}
    <div className="relay-fields aggregate-fields">
      <Field className="relay-field-name" label={t("名称")}>
        <Input value={profile.name} onChange={(event) => onStateChange(edit(state, { type: "patch", patch: { name: event.currentTarget.value } }))} placeholder={t("例如 主力聚合池")} />
      </Field>
      <Field className="aggregate-strategy-field" label={t("聚合策略")}>
        <RelayProfileCombobox
          ariaLabel={t("聚合策略")}
          onChange={(strategy) => onStateChange(edit(state, {
            type: "setAggregateStrategy",
            strategy,
          }))}
          options={aggregateStrategyOptions}
          value={aggregate.strategy}
        />
      </Field>
    </div>
    <div className="aggregate-strategy-grid">
      {aggregateStrategyOptions.map((option) => (
        <button
          className={`mode-option aggregate-strategy-option ${aggregate.strategy === option.value ? "active" : ""}`}
          key={option.value}
          onClick={() => onStateChange(edit(state, {
            type: "setAggregateStrategy",
            strategy: option.value,
          }))}
          type="button"
        >
          <strong>{option.label}</strong>
          <span>{option.description}</span>
        </button>
      ))}
    </div>
    <div className="aggregate-members">
      <div className="aggregate-members-head">
        <div>
          <strong>{t("成员供应商")}</strong>
          <span>{t("只能勾选已填写 Base URL / Key 的 API 供应商，聚合供应商不会作为成员。")}</span>
        </div>
        <UiBadge variant="outline">{aggregate.members.length} / {candidates.length}</UiBadge>
      </div>
      {candidates.length ? <div className="aggregate-member-list">{candidates.map((candidate) => {
        const member = aggregate.members.find((item) => item.profileId === candidate.id);
        const checked = memberIds.has(candidate.id);
        return <label className={`aggregate-member-row ${checked ? "selected" : ""}`} key={candidate.id}>
          <input checked={checked} onChange={(event) => onStateChange(edit(state, { type: "toggleAggregateMember", profileId: candidate.id, selected: event.currentTarget.checked }))} type="checkbox" />
          <span className="aggregate-member-summary">
            <strong>{candidate.name || t("未命名供应商")}</strong>
            <small>{relayModeLabel(candidate.relayMode)} · {relayProtocolLabel(candidate.protocol)} · {relayProfileConfigBrief(candidate)}</small>
          </span>
          <span className="aggregate-weight-box">
            <span>{t("权重")}</span>
            <Input disabled={!checked} min={1} onChange={(event) => onStateChange(edit(state, { type: "setAggregateMemberWeight", profileId: candidate.id, weight: Number.parseInt(event.currentTarget.value, 10) }))} type="number" value={String(member?.weight ?? 1)} />
          </span>
        </label>;
      })}</div> : <div className="empty">{t("先添加至少 1 个已填写 Base URL / Key 的 API 供应商，再创建聚合供应商。")}</div>}
    </div>
    <div className="relay-grid compact aggregate-preview">
      <Metric label={t("策略")} value={aggregateStrategyLabel(aggregate.strategy)} />
      <Metric label={t("成员数量")} value={tf("{0} 个", [aggregate.members.length])} />
      <Metric label={t("总权重")} value={`${state.semantic.aggregateTotalWeight}`} />
      <Metric label={t("序列化字段")} value="aggregate.strategy / aggregate.members" />
    </div>
    <div className="hint-line relay-protocol-hint">
      <ShieldCheck className="h-4 w-4" />
      <span>{aggregateStrategyHelp(aggregate.strategy)}</span>
    </div>
  </div>;
}
