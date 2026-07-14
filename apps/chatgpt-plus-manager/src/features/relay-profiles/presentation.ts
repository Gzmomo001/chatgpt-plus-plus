import { t,tf } from "@/i18n";
import type { CcsProvidersResult,RelayProfileView,RelaySettings,Status } from "./contracts";
import type { RelayAggregateStrategy,RelayMode,RelayProfile,RelayProfileCandidate,RelayProtocol,} from "./types";

export function relayProfileSwitchMessage(profile: RelayProfile): string {
  if (profile.relayMode === "aggregate") {
    return t("已切换到聚合供应商；真实对话会按所选策略轮转成员。");
  }
  if (profile.relayMode === "pureApi") {
    return t("已按此供应商切换到纯 API；Codex增强已设为完整增强。");
  }
  if (profile.officialMixApiKey) {
    return t("已按此供应商使用官方登录，并混入 API Key；Codex增强已设为兼容增强。");
  }
  return t("已按此供应商切回官方登录；Codex增强已设为兼容增强。");
}
export const aggregateStrategyOptions: Array<{
  value: RelayAggregateStrategy;
  label: string;
  description: string;
}>=[
    { value: "failover",label: t("失败切换"),description: t("按成员顺序请求，失败后切到下一个供应商。") },
    { value: "conversationRoundRobin",label: t("按对话轮转"),description: t("同一对话保持一个成员，不同对话依次分配。") },
    { value: "requestRoundRobin",label: t("按请求轮转"),description: t("每次请求按成员顺序切换，适合均匀摊请求量。") },
    { value: "weightedRoundRobin",label: t("权重轮转"),description: t("按成员权重分配请求，权重越高承担越多。") },
  ];
export function providerInitial(name: string): string {
  const trimmed=(name||t("供应商")).trim();
  return Array.from(trimmed)[0]?.toUpperCase()||t("供");
}
export function relayProtocolLabel(protocol: RelayProtocol): string {
  return protocol==="chatCompletions"? t("Chat Completions 转 Responses"):"Responses API";
}
export function relayModeLabel(mode: RelayMode): string {
  return mode==="aggregate"? t("聚合供应商"):mode==="pureApi"? t("纯 API"):t("官方登录");
}
export function relayProfileEditorStatus(profile: RelayProfileView,form: RelaySettings,isNew: boolean): string {
  if(isNew)
    return t("新建供应商需要先保存到列表");
  return profile.id===form.activeRelayId? t("当前正在使用"):t("编辑后保存列表，再切换模式时会使用新配置");
}
export function aggregateStrategyLabel(strategy: RelayAggregateStrategy): string {
  return aggregateStrategyOptions.find((option) => option.value===strategy)?.label??t("失败切换");
}
export function relayProfileConfigBrief(profile: RelayProfileView|RelayProfileCandidate): string {
  if(profile.relayMode==="aggregate") {
    return tf("{0} · {1} 个成员",[
      aggregateStrategyLabel(profile.aggregate?.strategy??"failover"),
      profile.aggregate?.members.length??0,
    ]);
  }
  if(profile.relayMode==="official")
    return profile.officialMixApiKey? t("混入 API Key"):t("不写 API 文件");
  return profile.baseUrl||t("未填写 URL");
}
export function relayProfileModeHelp(profile: RelayProfileView): string {
  if(profile.relayMode==="aggregate")
    return t("聚合供应商只保存成员和策略配置，成员来自已有 API 供应商；切为当前后会通过本地协议代理轮转请求。");
  if(profile.relayMode==="official")
    return profile.officialMixApiKey
      ? t("此供应商会保留官方登录模式，并把请求混入当前 API Key；Codex增强仍使用兼容模式。")
      :t("此供应商会切回官方登录模式，使用 ChatGPT 官方账号，不写入 API Key。");
  return profile.relayMode==="pureApi"
    ? t("此供应商会同时写入 config.toml 和 auth.json；API Key 也会注入到 provider bearer token。")
    :t("此供应商会保留官方登录模式，并把请求混入当前 API Key；Codex增强仍使用兼容模式。");
}
export function aggregateStrategyHelp(strategy: RelayAggregateStrategy): string {
  if(strategy==="failover")
    return t("失败切换会保留成员顺序，优先使用第一个可用供应商。");
  if(strategy==="conversationRoundRobin")
    return t("按对话轮转会让同一对话尽量保持固定成员，降低上下文漂移。");
  if(strategy==="requestRoundRobin")
    return t("按请求轮转会逐请求切换成员，适合供应商能力接近的场景。");
  return t("权重轮转会读取每个成员的权重值，权重越高的成员获得更多请求。");
}
export function ccsProviderSummary(result: CcsProvidersResult|null): string {
  if(!result)
    return t("读取 ~/.cc-switch/cc-switch.db");
  if(!isSuccessStatus(result.status))
    return result.message||t("读取 cc-switch 供应商失败。");
  return result.providers.length? tf("发现 {0} 个 Codex 供应商",[result.providers.length]):t("未发现可导入供应商");
}
function isSuccessStatus(status?: Status): boolean {
  return status==="ok"||status==="accepted";
}
export function configHasCodexGoalsFeature(contents: string): boolean {
  let inFeatures=false;
  for(const line of contents.split(/\r?\n/)) {
    const trimmed=line.trim();
    if(/^\[features\]$/.test(trimmed)) {
      inFeatures=true;
      continue;
    }
    if(inFeatures&&/^\[[^\]]+\]$/.test(trimmed))
      inFeatures=false;
    if(inFeatures&&/^goals\s*=\s*true\b/.test(trimmed))
      return true;
  }
  return false;
}
export function setCodexGoalsFeatureInConfig(contents: string,enabled: boolean): string {
  const lines=contents.split(/\r?\n/);
  const next: string[]=[];
  let inFeatures=false;
  let sawFeatures=false;
  let hasGoals=false;
  const insert=() => {
    if(enabled&&sawFeatures&&!hasGoals) {
      next.push("goals = true");
      hasGoals=true;
    }
  };
  for(const line of lines) {
    const trimmed=line.trim();
    if(/^\[features\]$/.test(trimmed)) {
      if(inFeatures)
        insert();
      inFeatures=true;
      sawFeatures=true;
      hasGoals=false;
      next.push(line);
      continue;
    }
    if(inFeatures&&/^\[[^\]]+\]$/.test(trimmed)) {
      insert();
      inFeatures=false;
    }
    if(inFeatures&&/^goals\s*=/.test(trimmed)) {
      if(enabled&&!hasGoals) {
        next.push("goals = true");
        hasGoals=true;
      }
      continue;
    }
    next.push(line);
  }
  if(inFeatures)
    insert();
  const normalized=next.join("\n").trimEnd();
  if(enabled&&!sawFeatures)
    return `${normalized? `${normalized}\n\n`:""}[features]\ngoals = true\n`;
  return normalized? `${normalized}\n`:"";
}
