import type {
  ModelWindowRow,
  RelayAggregateConfig,
  RelayAggregateMember,
  RelayAggregateStrategy,
  RelayContextSelection,
  RelayProfile,
  RelayProfileCollectionEdit,
  RelayProfileCommitResult,
  RelayProfileDraft,
  RelayProfileEdit,
  RelayProfileEditorContext,
  RelayProfileEditorState,
  RelayProfileIssue,
  RelayProfilePatch,
  RelayProfileSettings,
} from "./types";

const PROTOCOL_PROXY_BASE_URL = "http://127.0.0.1:57321/v1";

export function editRelayProfileCollection(
  settings: RelayProfileSettings,
  intent: RelayProfileCollectionEdit,
): RelayProfileSettings {
  let profiles = settings.relayProfiles.map((profile) => structuredClone(profile));
  let activeRelayId = settings.activeRelayId;
  if (intent.type === "activate") {
    if (profiles.some((profile) => profile.id === intent.profileId)) activeRelayId = intent.profileId;
  } else if (intent.type === "duplicate") {
    const index = profiles.findIndex((profile) => profile.id === intent.profileId);
    if (index >= 0) {
      profiles.splice(index + 1, 0, canonicalizeRelayProfile({
        ...profiles[index],
        id: intent.id,
        name: intent.name,
      }, profiles));
    }
  } else if (intent.type === "reorder") {
    const from = profiles.findIndex((profile) => profile.id === intent.profileId);
    const to = profiles.findIndex((profile) => profile.id === intent.targetId);
    if (from >= 0 && to >= 0 && from !== to) {
      const [moved] = profiles.splice(from, 1);
      profiles.splice(to, 0, moved);
    }
  } else {
    profiles = profiles.filter((profile) => profile.id !== intent.profileId);
    profiles = cleanupAggregateReferences(profiles);
    if (!profiles.some((profile) => profile.id === activeRelayId)) activeRelayId = profiles[0]?.id ?? "";
  }
  return projectSettings(settings, profiles, activeRelayId);
}

export function normalizeRelayProfileSettings(
  settings: RelayProfileSettings,
  defaultContextSelection: RelayContextSelection,
): RelayProfileSettings {
  const aggregates = new Map(settings.aggregateRelayProfiles.map((aggregate) => [aggregate.id, aggregate]));
  const sourceProfiles = settings.relayProfiles.length ? settings.relayProfiles : [];
  const hydrated = sourceProfiles.map((source) => {
    const aggregate = aggregates.get(source.id);
    const legacyMixed = source.relayMode === "mixedApi";
    const contextSelection = source.contextSelectionInitialized
      ? structuredClone(source.contextSelection)
      : structuredClone(defaultContextSelection);
    const profile: RelayProfile = {
      ...source,
      model: source.model ?? "",
      baseUrl: source.baseUrl ?? "",
      upstreamBaseUrl: source.upstreamBaseUrl || source.baseUrl || "",
      apiKey: source.apiKey ?? "",
      protocol: source.protocol === "chatCompletions" ? "chatCompletions" : "responses",
      relayMode: aggregate ? "aggregate" : legacyMixed ? "official" : source.relayMode,
      officialMixApiKey: source.officialMixApiKey || legacyMixed,
      testModel: source.testModel ?? "",
      configContents: source.configContents ?? "",
      authContents: source.authContents ?? "",
      useCommonConfig: source.useCommonConfig !== false,
      contextSelection,
      contextSelectionInitialized: true,
      contextWindow: source.contextWindow ?? "",
      autoCompactLimit: source.autoCompactLimit ?? "",
      modelList: source.modelList ?? "",
      modelWindows: source.modelWindows || "{}",
      userAgent: source.userAgent ?? "",
      aggregate: aggregate ? {
        strategy: aggregate.strategy,
        members: aggregate.members.map((member) => ({ profileId: member.relayId, weight: member.weight })),
      } : source.aggregate ?? null,
      name: source.name || aggregate?.name || "",
    };
    if (profile.relayMode === "official" && !profile.officialMixApiKey) {
      profile.configContents = "";
      profile.authContents = removeAuthApiKey(profile.authContents);
    }
    return canonicalizeRelayProfile(profile, sourceProfiles);
  });
  const activeRelayId = hydrated.some((profile) => profile.id === settings.activeRelayId)
    ? settings.activeRelayId
    : hydrated[0]?.id ?? "";
  return projectSettings(settings, cleanupAggregateReferences(hydrated), activeRelayId);
}

export function seedRelayProfile(
  settings: RelayProfileSettings,
  mode: "official" | "pureApi" | "aggregate",
  id: string,
  name: string,
  defaultContextSelection: RelayContextSelection,
): RelayProfile {
  const defaultBaseUrl = mode === "aggregate" ? "" : settings.relayBaseUrl;
  const base: RelayProfile = {
    id, name, model: "", baseUrl: defaultBaseUrl, upstreamBaseUrl: defaultBaseUrl, apiKey: "",
    protocol: "responses", relayMode: mode, officialMixApiKey: false, testModel: "",
    configContents: "", authContents: "", useCommonConfig: true,
    contextSelection: structuredClone(defaultContextSelection), contextSelectionInitialized: true,
    contextWindow: "", autoCompactLimit: "", modelList: "", modelWindows: "{}", userAgent: "",
    aggregate: mode === "aggregate" ? { strategy: "failover", members: [] } : null,
  };
  return canonicalizeRelayProfile(base, settings.relayProfiles);
}

export function canonicalizeRelayProfile(profile: RelayProfile, profiles: RelayProfile[] = []): RelayProfile {
  if (profile.relayMode === "aggregate") {
    const { modelList: _modelList, modelWindows: _modelWindows, ...draft } = profile;
    const projected = projectDraft({
      ...draft,
      models: [{ model: "", window: "" }],
      aggregate: normalizeAggregate(profile.aggregate, profile.id, profiles),
    });
    return { ...projected, modelList: "", modelWindows: "{}" };
  }
  return deriveProfileFromStoredFiles(profile);
}

export function normalizeRelayAggregateConfig(
  aggregate: RelayAggregateConfig | null | undefined,
  aggregateId: string,
  profiles: RelayProfile[],
): RelayAggregateConfig {
  return normalizeAggregate(aggregate, aggregateId, profiles);
}

export function relayProfileFromDraft(draft: RelayProfileDraft): RelayProfile {
  const serialized = serializeRows(draft.models);
  const { models: _models, ...profile } = draft;
  return { ...profile, ...serialized };
}

export function open(
  source: RelayProfile,
  context: RelayProfileEditorContext,
): RelayProfileEditorState {
  const isNew = !context.profiles.some((profile) => profile.id === source.id);
  const hydrated =
    !isNew && source.id === context.activeRelayId && context.liveFiles
      ? { ...source, ...context.liveFiles }
      : source;
  const semantic = deriveProfileFromStoredFiles(hydrated);
  if (!semantic.contextSelectionInitialized) {
    semantic.contextSelection = structuredClone(context.defaultContextSelection);
    semantic.contextSelectionInitialized = true;
  }
  const {
    modelList: _modelList,
    modelWindows: _modelWindows,
    ...semanticDraft
  } = semantic;
  const draft: RelayProfileDraft = {
    ...semanticDraft,
    models: modelRows(semantic.modelList, semantic.modelWindows),
  };
  if (semantic.relayMode === "aggregate") {
    Object.assign(draft, projectDraft({
      ...draft,
      aggregate: normalizeAggregate(draft.aggregate, source.id, context.profiles),
    }));
  }
  const state = {
    sourceId: source.id,
    isNew,
    draft,
    issues: [],
    context: cloneContext(context),
  };
  return withIssues(state);
}

export function edit(
  state: RelayProfileEditorState,
  intent: RelayProfileEdit,
): RelayProfileEditorState {
  if (intent.type === "applyPreset") {
    const draft = projectDraft({
      ...state.draft,
      name: intent.preset.name,
      baseUrl: intent.preset.baseUrl,
      upstreamBaseUrl: intent.preset.baseUrl,
      protocol: intent.preset.protocol,
      model: intent.preset.model,
      testModel: intent.preset.model,
      relayMode: intent.preset.relayMode,
      officialMixApiKey: false,
      models: canonicalRows(intent.preset.models),
    });
    return withIssues({ ...state, draft });
  }
  if (intent.type === "replaceModels") {
    return withIssues({ ...state, draft: { ...state.draft, models: canonicalRows(intent.models) } });
  }
  if (intent.type === "mergeModels") {
    return withIssues({
      ...state,
      draft: {
        ...state.draft,
        models: canonicalRows([...state.draft.models, ...intent.models]),
      },
    });
  }
  if (intent.type === "removeModel") {
    const target = intent.model.trim();
    const models = state.draft.models.filter((row) => row.model.trim() !== target);
    return withIssues({
      ...state,
      draft: { ...state.draft, models: models.length ? models : [{ model: "", window: "" }] },
    });
  }
  if (intent.type === "setAggregate") {
    const draft = projectDraft({
      ...state.draft,
      relayMode: "aggregate",
      aggregate: normalizeAggregate(intent.aggregate, state.sourceId, state.context.profiles),
    });
    return withIssues({ ...state, draft });
  }
  if (intent.type === "replaceStoredFiles") {
    const serialized = serializeRows(state.draft.models);
    const { models, ...current } = state.draft;
    const derived = deriveProfileFromStoredFiles({
      ...current,
      configContents: intent.configContents,
      authContents: intent.authContents,
      modelList: serialized.modelList,
      modelWindows: serialized.modelWindows,
    });
    const {
      modelList: _modelList,
      modelWindows: _modelWindows,
      ...derivedDraft
    } = derived;
    const draft: RelayProfileDraft = { ...derivedDraft, models: structuredClone(models) };
    return withIssues({ ...state, draft });
  }
  if (intent.type !== "patch") return state;
  const {
    modelList: _modelList,
    modelWindows: _modelWindows,
    models: _models,
    aggregate,
    ...profilePatch
  } = structuredClone(intent.patch) as RelayProfilePatch & {
    modelList?: unknown;
    modelWindows?: unknown;
    models?: unknown;
  };
  let patched: RelayProfileDraft = {
    ...state.draft,
    ...profilePatch,
    models: state.draft.models,
  };
  if (aggregate !== undefined) {
    patched = {
      ...patched,
      aggregate: normalizeAggregate(aggregate, state.sourceId, state.context.profiles),
    };
  }
  if (intent.patch.baseUrl !== undefined) patched.upstreamBaseUrl = intent.patch.baseUrl;
  if (intent.patch.upstreamBaseUrl !== undefined) patched.baseUrl = intent.patch.upstreamBaseUrl;
  const draft = projectDraft(patched);
  return withIssues({ ...state, draft });
}

export function commit(state: RelayProfileEditorState): RelayProfileCommitResult {
  const issues = issuesForDraft(state.draft);
  if (issues.some((issue) => issue.blocking)) return { ok: false, issues };
  const serialized = serializeRows(state.draft.models);
  const { models: _models, ...draft } = state.draft;
  const profile: RelayProfile = {
    ...draft,
    modelList: serialized.modelList,
    modelWindows: serialized.modelWindows,
  };
  let relayProfiles = state.isNew
    ? [...state.context.profiles, profile]
    : state.context.profiles.map((candidate) =>
        candidate.id === state.sourceId ? profile : candidate,
      );
  relayProfiles = cleanupAggregateReferences(relayProfiles);
  const activeRelayId = relayProfiles.some((candidate) => candidate.id === state.context.activeRelayId)
    ? state.context.activeRelayId
    : relayProfiles[0]?.id ?? "";
  const active = relayProfiles.find((candidate) => candidate.id === activeRelayId) ?? profile;
  const aggregateRelayProfiles = relayProfiles
    .filter((candidate) => candidate.relayMode === "aggregate")
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      strategy: candidate.aggregate?.strategy ?? "failover",
      members: (candidate.aggregate?.members ?? []).map((member) => ({
        relayId: member.profileId,
        weight: member.weight,
      })),
    }));
  return {
    ok: true,
    profile,
    settings: {
      ...state.context.settings,
      relayProfiles,
      activeRelayId,
      relayBaseUrl: active.relayMode === "aggregate" ? PROTOCOL_PROXY_BASE_URL : active.baseUrl,
      relayApiKey: active.apiKey,
      aggregateRelayProfiles,
      activeAggregateRelayId: active.relayMode === "aggregate" ? active.id : "",
    },
  };
}

function projectSettings(
  settings: RelayProfileSettings,
  relayProfiles: RelayProfile[],
  activeRelayId: string,
): RelayProfileSettings {
  const active = relayProfiles.find((profile) => profile.id === activeRelayId) ?? relayProfiles[0];
  return {
    ...settings,
    relayProfiles,
    activeRelayId: active?.id ?? "",
    relayBaseUrl: active?.relayMode === "aggregate" ? PROTOCOL_PROXY_BASE_URL : active?.baseUrl ?? "",
    relayApiKey: active?.apiKey ?? "",
    aggregateRelayProfiles: relayProfiles.filter((profile) => profile.relayMode === "aggregate").map((profile) => ({
      id: profile.id,
      name: profile.name,
      strategy: profile.aggregate?.strategy ?? "failover",
      members: (profile.aggregate?.members ?? []).map((member) => ({ relayId: member.profileId, weight: member.weight })),
    })),
    activeAggregateRelayId: active?.relayMode === "aggregate" ? active.id : "",
  };
}

function modelRows(modelList: string, modelWindows: string): ModelWindowRow[] {
  let windows: Record<string, string> = {};
  try {
    windows = JSON.parse(modelWindows || "{}") as Record<string, string>;
  } catch {
    windows = {};
  }
  const rows: ModelWindowRow[] = [];
  const seen = new Set<string>();
  for (const raw of modelList.split(/\r?\n/)) {
    const legacy = parseLegacyModelSuffix(raw);
    if (!legacy.model || seen.has(legacy.model)) continue;
    seen.add(legacy.model);
    rows.push({
      model: legacy.model,
      window: windows[raw.trim()]?.trim() ?? windows[legacy.model]?.trim() ?? legacy.window,
    });
  }
  return rows.length ? rows : [{ model: "", window: "" }];
}

function parseLegacyModelSuffix(raw: string): ModelWindowRow {
  const trimmed = raw.trim();
  const match = /^(.*?)\[(\d+(?:[KkMm])?)\]$/.exec(trimmed);
  if (!match) return { model: trimmed, window: "" };
  return { model: match[1].trim(), window: match[2].toUpperCase() };
}

function deriveProfileFromStoredFiles(profile: RelayProfile): RelayProfile {
  if (profile.relayMode === "aggregate") return profile;
  const configModel = topLevelTomlString(profile.configContents, "model");
  const provider = topLevelTomlString(profile.configContents, "model_provider");
  const baseUrl = provider
    ? sectionTomlString(profile.configContents, `model_providers.${provider}`, "base_url")
    : "";
  const bearer = provider
    ? sectionTomlString(
        profile.configContents,
        `model_providers.${provider}`,
        "experimental_bearer_token",
      )
    : "";
  const authKey = authApiKey(profile.authContents);
  return {
    ...profile,
    model: configModel || parseLegacyModelSuffix(profile.model).model,
    baseUrl: baseUrl || profile.upstreamBaseUrl || profile.baseUrl,
    upstreamBaseUrl: profile.upstreamBaseUrl || baseUrl || profile.baseUrl,
    apiKey:
      profile.relayMode === "official"
        ? bearer || profile.apiKey
        : authKey || bearer || profile.apiKey,
    contextWindow:
      topLevelTomlInteger(profile.configContents, "model_context_window") ||
      profile.contextWindow,
    autoCompactLimit:
      topLevelTomlInteger(profile.configContents, "model_auto_compact_token_limit") ||
      profile.autoCompactLimit,
  };
}

function topLevelTomlString(contents: string, key: string): string {
  let section = "";
  for (const line of contents.split(/\r?\n/)) {
    const nextSection = /^\s*\[([^\]]+)]\s*$/.exec(line);
    if (nextSection) {
      section = nextSection[1].trim();
      continue;
    }
    if (section) continue;
    const value = tomlStringValue(line, key);
    if (value !== null) return value;
  }
  return "";
}

function topLevelTomlInteger(contents: string, key: string): string {
  let section = "";
  for (const line of contents.split(/\r?\n/)) {
    const nextSection = /^\s*\[([^\]]+)]\s*$/.exec(line);
    if (nextSection) {
      section = nextSection[1].trim();
      continue;
    }
    if (section) continue;
    const match = new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*(?:#.*)?$`).exec(line);
    if (match) return match[1];
  }
  return "";
}

function sectionTomlString(contents: string, sectionName: string, key: string): string {
  let section = "";
  for (const line of contents.split(/\r?\n/)) {
    const nextSection = /^\s*\[([^\]]+)]\s*$/.exec(line);
    if (nextSection) {
      section = nextSection[1].trim();
      continue;
    }
    if (section !== sectionName) continue;
    const value = tomlStringValue(line, key);
    if (value !== null) return value;
  }
  return "";
}

function tomlStringValue(line: string, key: string): string | null {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(["'])(.*)\\1\\s*(?:#.*)?$`).exec(
    line.trim(),
  );
  return match ? match[2].replace(/\\(["'\\])/g, "$1") : null;
}

function authApiKey(contents: string): string {
  try {
    const parsed = JSON.parse(contents || "{}") as { OPENAI_API_KEY?: unknown };
    return typeof parsed.OPENAI_API_KEY === "string" ? parsed.OPENAI_API_KEY.trim() : "";
  } catch {
    return "";
  }
}

function serializeRows(rows: ModelWindowRow[]): { modelList: string; modelWindows: string } {
  const models: string[] = [];
  const windows: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const model = row.model.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    models.push(model);
    const window = row.window.trim();
    if (window) windows[model] = window;
  }
  return { modelList: models.join("\n"), modelWindows: JSON.stringify(windows) };
}

function canonicalRows(rows: ModelWindowRow[]): ModelWindowRow[] {
  const canonical: ModelWindowRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const model = row.model.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    canonical.push({ model, window: row.window.trim() });
  }
  return canonical.length ? canonical : [{ model: "", window: "" }];
}

function withIssues(state: RelayProfileEditorState): RelayProfileEditorState {
  return { ...state, issues: issuesForDraft(state.draft) };
}

function issuesForDraft(draft: RelayProfileDraft): RelayProfileIssue[] {
  const issues: RelayProfileIssue[] = [];
  for (const row of draft.models) {
    const window = row.window.trim();
    if (!window || /^[1-9]\d*[KkMm]?$/.test(window)) continue;
    issues.push({
      code: "invalidModelWindow",
      field: `models.${row.model.trim() || "unknown"}.window`,
      message: "模型上下文窗口必须为空或正整数，可带 K/M 后缀。",
      blocking: true,
    });
  }
  if (draft.relayMode === "aggregate" && !(draft.aggregate?.members.length)) {
    issues.push({
      code: "aggregateMembersRequired",
      field: "aggregate.members",
      message: "聚合供应商至少需要一个成员。",
      blocking: true,
    });
  }
  return issues;
}

function normalizeAggregate(
  aggregate: RelayAggregateConfig | null | undefined,
  sourceId: string,
  profiles: RelayProfile[],
): RelayAggregateConfig {
  const candidates = new Set(
    profiles
      .filter(
        (profile) =>
          profile.id !== sourceId &&
          profile.relayMode !== "aggregate" &&
          !profile.aggregate &&
          Boolean(profile.baseUrl.trim() && profile.apiKey.trim()),
      )
      .map((profile) => profile.id),
  );
  const seen = new Set<string>();
  const members: RelayAggregateMember[] = [];
  for (const member of aggregate?.members ?? []) {
    if (!candidates.has(member.profileId) || seen.has(member.profileId)) continue;
    seen.add(member.profileId);
    const finite = Number.isFinite(member.weight) ? Math.round(member.weight) : 1;
    members.push({ profileId: member.profileId, weight: Math.max(1, Math.min(999, finite)) });
  }
  const strategies: RelayAggregateStrategy[] = [
    "failover",
    "conversationRoundRobin",
    "requestRoundRobin",
    "weightedRoundRobin",
  ];
  return {
    strategy: strategies.includes(aggregate?.strategy ?? "failover")
      ? (aggregate?.strategy ?? "failover")
      : "failover",
    members,
  };
}

function cleanupAggregateReferences(profiles: RelayProfile[]): RelayProfile[] {
  const standardIds = new Set(
    profiles
      .filter(
        (profile) =>
          profile.relayMode !== "aggregate" &&
          !profile.aggregate &&
          Boolean(profile.baseUrl.trim() && profile.apiKey.trim()),
      )
      .map((profile) => profile.id),
  );
  return profiles.map((profile) => {
    if (profile.relayMode !== "aggregate") return profile;
    const seen = new Set<string>();
    const members = (profile.aggregate?.members ?? []).filter((member) => {
      if (!standardIds.has(member.profileId) || member.profileId === profile.id || seen.has(member.profileId)) return false;
      seen.add(member.profileId);
      return true;
    }).map((member) => ({
      profileId: member.profileId,
      weight: Math.max(1, Math.min(999, Number.isFinite(member.weight) ? Math.round(member.weight) : 1)),
    }));
    return { ...profile, aggregate: { strategy: profile.aggregate?.strategy ?? "failover", members } };
  });
}

function setAuthApiKey(contents: string, apiKey: string): string {
  let auth: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(contents || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) auth = parsed;
  } catch {
    auth = {};
  }
  auth.OPENAI_API_KEY = apiKey.trim();
  return `${JSON.stringify(auth, null, 2)}\n`;
}

function removeAuthApiKey(contents: string): string {
  if (!contents.trim()) return "";
  try {
    const parsed = JSON.parse(contents) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
    delete parsed.OPENAI_API_KEY;
    return Object.keys(parsed).length ? `${JSON.stringify(parsed, null, 2)}\n` : "";
  } catch {
    return "";
  }
}

function projectDraft(draft: RelayProfileDraft): RelayProfileDraft {
  if (draft.relayMode === "aggregate") {
    return {
      ...draft,
      model: "",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      protocol: "responses",
      officialMixApiKey: false,
      configContents: "",
      authContents: "",
      contextWindow: "",
      autoCompactLimit: "",
      models: [{ model: "", window: "" }],
    };
  }
  if (draft.relayMode === "official" && !draft.officialMixApiKey) {
    return {
      ...draft,
      configContents: "",
      authContents: removeAuthApiKey(draft.authContents),
    };
  }

  const configContents = projectConfig(draft);
  if (draft.relayMode === "pureApi") {
    return {
      ...draft,
      configContents: removeSectionKey(
        configContents,
        activeProvider(configContents),
        "experimental_bearer_token",
      ),
      authContents: setAuthApiKey(draft.authContents, draft.apiKey),
    };
  }
  return {
    ...draft,
    configContents: setSectionString(
      configContents,
      activeProvider(configContents),
      "experimental_bearer_token",
      draft.apiKey,
    ),
    authContents: removeAuthApiKey(draft.authContents),
  };
}

function projectConfig(draft: RelayProfileDraft): string {
  const provider = activeProvider(draft.configContents);
  let contents = draft.configContents;
  contents = setRootString(contents, "model_provider", provider);
  contents = draft.model.trim()
    ? setRootString(contents, "model", parseLegacyModelSuffix(draft.model).model)
    : removeRootKey(contents, "model");
  contents = setSectionString(contents, provider, "name", provider);
  contents = setSectionString(contents, provider, "wire_api", "responses");
  contents = setSectionRaw(contents, provider, "requires_openai_auth", "true");
  const upstream = draft.upstreamBaseUrl.trim() || draft.baseUrl.trim();
  contents = setSectionString(
    contents,
    provider,
    "base_url",
    draft.protocol === "chatCompletions" ? PROTOCOL_PROXY_BASE_URL : upstream,
  );
  contents = setRootDigits(contents, "model_context_window", draft.contextWindow);
  contents = setRootDigits(
    contents,
    "model_auto_compact_token_limit",
    draft.autoCompactLimit,
  );
  return contents;
}

function activeProvider(contents: string): string {
  return topLevelTomlString(contents, "model_provider") || "custom";
}

function setRootString(contents: string, key: string, value: string): string {
  return setRootRaw(contents, key, `"${escapeToml(value.trim())}"`);
}

function setRootDigits(contents: string, key: string, value: string): string {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? setRootRaw(contents, key, digits) : removeRootKey(contents, key);
}

function setRootRaw(contents: string, key: string, rawValue: string): string {
  const lines = contents.split(/\r?\n/);
  const firstTable = lines.findIndex((line) => /^\s*\[[^\]]+]\s*$/.test(line));
  const rootEnd = firstTable < 0 ? lines.length : firstTable;
  for (let index = 0; index < rootEnd; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index])) {
      lines[index] = `${key} = ${rawValue}`;
      return trailingNewline(lines.join("\n"));
    }
  }
  lines.splice(key === "model" ? 0 : rootEnd, 0, `${key} = ${rawValue}`);
  return trailingNewline(lines.join("\n"));
}

function removeRootKey(contents: string, key: string): string {
  let inRoot = true;
  return trailingNewline(
    contents
      .split(/\r?\n/)
      .filter((line) => {
        if (/^\s*\[[^\]]+]\s*$/.test(line)) inRoot = false;
        return !(inRoot && new RegExp(`^\\s*${key}\\s*=`).test(line));
      })
      .join("\n"),
  );
}

function setSectionString(contents: string, provider: string, key: string, value: string): string {
  return setSectionRaw(contents, provider, key, `"${escapeToml(value.trim())}"`);
}

function setSectionRaw(contents: string, provider: string, key: string, rawValue: string): string {
  const sectionName = `model_providers.${provider}`;
  const lines = contents.split(/\r?\n/);
  let start = -1;
  let end = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*\[([^\]]+)]\s*$/.exec(lines[index]);
    if (!match) continue;
    if (start >= 0) {
      end = index;
      break;
    }
    if (match[1].trim() === sectionName) start = index;
  }
  if (start < 0) {
    return trailingNewline(`${contents.trimEnd()}\n\n[${sectionName}]\n${key} = ${rawValue}`);
  }
  for (let index = start + 1; index < end; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index])) {
      lines[index] = `${key} = ${rawValue}`;
      return trailingNewline(lines.join("\n"));
    }
  }
  lines.splice(end, 0, `${key} = ${rawValue}`);
  return trailingNewline(lines.join("\n"));
}

function removeSectionKey(contents: string, provider: string, key: string): string {
  const sectionName = `model_providers.${provider}`;
  let section = "";
  return trailingNewline(
    contents
      .split(/\r?\n/)
      .filter((line) => {
        const match = /^\s*\[([^\]]+)]\s*$/.exec(line);
        if (match) section = match[1].trim();
        return !(section === sectionName && new RegExp(`^\\s*${key}\\s*=`).test(line));
      })
      .join("\n"),
  );
}

function escapeToml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function trailingNewline(contents: string): string {
  return `${contents.trimEnd()}\n`;
}

function cloneContext(context: RelayProfileEditorContext): RelayProfileEditorContext {
  return {
    ...context,
    profiles: context.profiles.map((profile) => structuredClone(profile)),
    defaultContextSelection: structuredClone(context.defaultContextSelection),
    settings: structuredClone(context.settings),
    liveFiles: context.liveFiles ? { ...context.liveFiles } : context.liveFiles,
  };
}
