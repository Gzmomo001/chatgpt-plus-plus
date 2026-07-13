import type {
  DeepReadonly,
  ModelWindowRow,
  RelayAggregateConfig,
  RelayAggregateMember,
  RelayAggregateStrategy,
  RelayContextSelection,
  RelayProfile,
  RelayProfileCandidate,
  RelayProfileCollectionEdit,
  RelayProfileCommitEffect,
  RelayProfileCommitResult,
  RelayProfileDraft,
  RelayProfileEdit,
  RelayProfileEditorContext,
  RelayProfileEditorState,
  RelayProfileIssue,
  RelayProfileOpenRequest,
  RelayProfilePatch,
  RelayProfileSettings,
} from "./types";

const PROTOCOL_PROXY_BASE_URL = "http://127.0.0.1:57321/v1";

function normalizeRelayProfileSettings(
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
      nativeImageGenerationEnabled: source.nativeImageGenerationEnabled === true,
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

function seedRelayProfile(
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
    nativeImageGenerationEnabled: false,
    configContents: "", authContents: "", useCommonConfig: true,
    contextSelection: structuredClone(defaultContextSelection), contextSelectionInitialized: true,
    contextWindow: "", autoCompactLimit: "", modelList: "", modelWindows: "{}", userAgent: "",
    aggregate: mode === "aggregate" ? { strategy: "failover", members: [] } : null,
  };
  return canonicalizeRelayProfile(base, settings.relayProfiles);
}

function canonicalizeRelayProfile(profile: RelayProfile, profiles: RelayProfile[] = []): RelayProfile {
  if (profile.relayMode === "aggregate") {
    const { modelList: _storedModelList, modelWindows: _storedModelWindows, ...draft } = profile;
    const projected = projectDraft({
      ...draft,
      models: [{ model: "", window: "" }],
      aggregate: normalizeAggregate(profile.aggregate, profile.id, profiles),
    });
    return { ...projected, modelList: "", modelWindows: "{}" };
  }
  return deriveProfileFromStoredFiles(profile);
}

function projectProfile(draft: RelayProfileDraft): RelayProfile {
  const serialized = serializeRows(draft.models);
  const { models: _models, ...profile } = draft;
  return {
    ...profile,
    ...serialized,
    contextSelection: {
      mcpServers: [...profile.contextSelection.mcpServers],
      skills: [...profile.contextSelection.skills],
      plugins: [...profile.contextSelection.plugins],
    },
    aggregate: profile.aggregate ? {
      strategy: profile.aggregate.strategy,
      members: profile.aggregate.members.map((member) => ({ ...member })),
    } : profile.aggregate,
  };
}

function projectPreviewProfile(draft: RelayProfileDraft): DeepReadonly<RelayProfile> {
  const profile = projectProfile(draft);
  Object.freeze(profile.contextSelection.mcpServers);
  Object.freeze(profile.contextSelection.skills);
  Object.freeze(profile.contextSelection.plugins);
  Object.freeze(profile.contextSelection);
  if (profile.aggregate) {
    for (const member of profile.aggregate.members) Object.freeze(member);
    Object.freeze(profile.aggregate.members);
    Object.freeze(profile.aggregate);
  }
  return Object.freeze(profile);
}

export function open(
  request: RelayProfileOpenRequest,
): RelayProfileEditorState {
  const settings = normalizeRelayProfileSettings(
    request.settings,
    request.defaultContextSelection,
  );
  const focus = request.focus ?? {
    type: "existing" as const,
    profileId: settings.activeRelayId,
  };
  const existing = focus.type === "existing"
    ? settings.relayProfiles.find((profile) => profile.id === focus.profileId)
      ?? settings.relayProfiles.find((profile) => profile.id === settings.activeRelayId)
      ?? settings.relayProfiles[0]
    : undefined;
  const source = focus.type === "create"
    ? seedRelayProfile(
        { ...settings, relayBaseUrl: request.settings.relayBaseUrl },
        focus.mode,
        focus.id,
        focus.name,
        request.defaultContextSelection,
      )
    : existing ?? seedRelayProfile(
        { ...settings, relayBaseUrl: request.settings.relayBaseUrl },
        "official",
        focus.profileId || "default",
        "",
        request.defaultContextSelection,
      );
  const isNew = focus.type === "create" || !existing;
  const context: RelayProfileEditorContext = {
    profiles: settings.relayProfiles,
    activeRelayId: settings.activeRelayId,
    defaultContextSelection: request.defaultContextSelection,
    settings,
    liveFiles: request.liveFiles,
  };
  const usesLiveFiles = source.relayMode !== "official" || source.officialMixApiKey;
  const hydrated =
    !isNew && source.id === context.activeRelayId && usesLiveFiles && context.liveFiles
      ? { ...source, ...context.liveFiles }
      : source;
  const semantic = deriveProfileFromStoredFiles(hydrated);
  if (!semantic.contextSelectionInitialized) {
    semantic.contextSelection = structuredClone(context.defaultContextSelection);
    semantic.contextSelectionInitialized = true;
  }
  const {
    modelList: _storedModelList,
    modelWindows: _storedModelWindows,
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
    pendingCollectionEdit: null,
    issues: [],
    context: cloneContext(context),
  };
  return withIssues(state);
}

export function edit(
  state: RelayProfileEditorState,
  intent: RelayProfileEdit,
): RelayProfileEditorState {
  if (isCollectionEdit(intent)) {
    return withIssues({ ...state, pendingCollectionEdit: structuredClone(intent) });
  }
  if (intent.type === "setMode") {
    const draft = projectDraft({
      ...state.draft,
      relayMode: intent.mode,
      officialMixApiKey: intent.mode === "official" ? false : state.draft.officialMixApiKey,
      aggregate: intent.mode === "aggregate"
        ? normalizeAggregate(state.draft.aggregate, state.sourceId, state.context.profiles)
        : null,
    });
    return withIssues({ ...state, draft });
  }
  if (intent.type === "setAggregateStrategy") {
    if (state.draft.relayMode !== "aggregate") return state;
    const aggregate = normalizeAggregate({
      strategy: intent.strategy,
      members: state.draft.aggregate?.members ?? [],
    }, state.sourceId, state.context.profiles);
    return withIssues({ ...state, draft: { ...state.draft, aggregate } });
  }
  if (intent.type === "toggleAggregateMember") {
    if (state.draft.relayMode !== "aggregate") return state;
    const current = state.draft.aggregate ?? { strategy: "failover", members: [] };
    const members = intent.selected
      ? [...current.members, { profileId: intent.profileId, weight: 1 }]
      : current.members.filter((member) => member.profileId !== intent.profileId);
    const aggregate = normalizeAggregate(
      { strategy: current.strategy, members },
      state.sourceId,
      state.context.profiles,
    );
    return withIssues({ ...state, draft: { ...state.draft, aggregate } });
  }
  if (intent.type === "setAggregateMemberWeight") {
    if (state.draft.relayMode !== "aggregate") return state;
    const current = state.draft.aggregate ?? { strategy: "failover", members: [] };
    const aggregate = normalizeAggregate({
      strategy: current.strategy,
      members: current.members.map((member) => member.profileId === intent.profileId
        ? { ...member, weight: intent.weight }
        : member),
    }, state.sourceId, state.context.profiles);
    return withIssues({ ...state, draft: { ...state.draft, aggregate } });
  }
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
      modelList: _storedModelList,
      modelWindows: _storedModelWindows,
      ...derivedDraft
    } = derived;
    const draft: RelayProfileDraft = { ...derivedDraft, models: structuredClone(models) };
    return withIssues({ ...state, draft });
  }
  if (intent.type !== "patch") return state;
  const {
    modelList: _storedModelList,
    modelWindows: _storedModelWindows,
    models: _models,
    aggregate: _aggregate,
    relayMode: _relayMode,
    ...profilePatch
  } = structuredClone(intent.patch) as RelayProfilePatch & {
    modelList?: unknown;
    modelWindows?: unknown;
    models?: unknown;
    aggregate?: unknown;
    relayMode?: unknown;
  };
  let patched: RelayProfileDraft = {
    ...state.draft,
    ...profilePatch,
    models: state.draft.models,
  };
  if (intent.patch.baseUrl !== undefined) patched.upstreamBaseUrl = intent.patch.baseUrl;
  if (intent.patch.upstreamBaseUrl !== undefined) patched.baseUrl = intent.patch.upstreamBaseUrl;
  const draft = projectDraft(patched);
  return withIssues({ ...state, draft });
}

export function commit(state: RelayProfileEditorState): RelayProfileCommitResult {
  const issues = issuesForState(state);
  if (issues.some((issue) => issue.blocking)) return { ok: false, issues };
  const profile = projectProfile(state.draft);
  const discardsNewDraft = state.isNew
    && state.pendingCollectionEdit?.type === "remove"
    && state.pendingCollectionEdit.profileId === state.sourceId;
  const removesCurrent = !discardsNewDraft
    && state.pendingCollectionEdit?.type === "remove"
    && state.pendingCollectionEdit.profileId === state.sourceId;
  let relayProfiles = removesCurrent
    ? state.context.profiles.filter((candidate) => candidate.id !== state.sourceId)
    : state.isNew
      ? discardsNewDraft
        ? state.context.profiles
        : [...state.context.profiles, profile]
      : state.context.profiles.map((candidate) =>
          candidate.id === state.sourceId ? profile : candidate,
        );
  let activeRelayId = state.context.activeRelayId;
  let effect: RelayProfileCommitEffect = { type: "saveSettings" };
  if (discardsNewDraft) {
    effect = { type: "updateSettings" };
  } else if (state.pendingCollectionEdit) {
    const applied = applyCollectionEdit(
      relayProfiles,
      activeRelayId,
      state.pendingCollectionEdit,
    );
    relayProfiles = applied.relayProfiles;
    activeRelayId = applied.activeRelayId;
    effect = applied.effect;
  }
  relayProfiles = cleanupAggregateReferences(relayProfiles);
  activeRelayId = relayProfiles.some((candidate) => candidate.id === activeRelayId)
    ? activeRelayId
    : relayProfiles[0]?.id ?? "";
  return {
    ok: true,
    profile,
    effect,
    switchIssue: switchIssueForDraft(state.draft),
    settings: projectSettings(state.context.settings, relayProfiles, activeRelayId),
  };
}

function isCollectionEdit(intent: RelayProfileEdit): intent is RelayProfileCollectionEdit {
  return intent.type === "activate"
    || intent.type === "duplicate"
    || intent.type === "reorder"
    || intent.type === "remove";
}

function applyCollectionEdit(
  relayProfiles: RelayProfile[],
  activeRelayId: string,
  intent: RelayProfileCollectionEdit,
): {
  relayProfiles: RelayProfile[];
  activeRelayId: string;
  effect: RelayProfileCommitEffect;
} {
  const profiles = relayProfiles.map((candidate) => structuredClone(candidate));
  if (intent.type === "activate") {
    return {
      relayProfiles: profiles,
      activeRelayId: intent.profileId,
      effect: { type: "switchProfile", profileId: intent.profileId },
    };
  }
  if (intent.type === "duplicate") {
    const sourceIndex = profiles.findIndex((candidate) => candidate.id === intent.profileId);
    profiles.splice(sourceIndex + 1, 0, canonicalizeRelayProfile({
      ...profiles[sourceIndex],
      id: intent.id,
      name: intent.name,
    }, profiles));
    return { relayProfiles: profiles, activeRelayId, effect: { type: "updateSettings" } };
  }
  if (intent.type === "reorder") {
    const from = profiles.findIndex((candidate) => candidate.id === intent.profileId);
    const to = profiles.findIndex((candidate) => candidate.id === intent.targetId);
    if (from !== to) {
      const [moved] = profiles.splice(from, 1);
      profiles.splice(to, 0, moved);
    }
    return { relayProfiles: profiles, activeRelayId, effect: { type: "updateSettings" } };
  }
  return {
    relayProfiles: profiles.filter((candidate) => candidate.id !== intent.profileId),
    activeRelayId,
    effect: { type: "updateSettings" },
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

function withIssues(
  state: Omit<RelayProfileEditorState, "issues" | "semantic" | "preview"> &
    Partial<Pick<RelayProfileEditorState, "issues" | "semantic" | "preview">>,
): RelayProfileEditorState {
  const aggregateCandidates = aggregateCandidatesFor(
    state.sourceId,
    state.context.profiles,
  );
  return {
    ...state,
    preview: Object.freeze({ profile: projectPreviewProfile(state.draft) }),
    issues: issuesForState(state),
    semantic: {
      aggregateCandidates,
      aggregateTotalWeight: (state.draft.aggregate?.members ?? []).reduce(
        (total, member) => total + member.weight,
        0,
      ),
      usesLiveFiles: state.draft.relayMode !== "official" || state.draft.officialMixApiKey,
      switchIssue: switchIssueForDraft(state.draft),
    },
  };
}

function issuesForState(
  state: Pick<
    RelayProfileEditorState,
    "sourceId" | "draft" | "isNew" | "context" | "pendingCollectionEdit"
  >,
): RelayProfileIssue[] {
  const discardsCurrentDraft = state.pendingCollectionEdit?.type === "remove"
    && state.pendingCollectionEdit.profileId === state.sourceId;
  const issues = discardsCurrentDraft ? [] : issuesForDraft(state.draft);
  if (
    !discardsCurrentDraft
    && state.isNew
    && state.context.profiles.some((profile) => profile.id === state.draft.id)
  ) {
    issues.push({
      code: "duplicateProfileId",
      field: "id",
      message: `供应商 ID「${state.draft.id}」已存在，请重新创建后再保存。`,
      blocking: true,
    });
  }
  const intent = state.pendingCollectionEdit;
  if (intent) {
    const ids = new Set(state.context.profiles.map((profile) => profile.id));
    if (state.isNew) ids.add(state.draft.id);
    const missing = !ids.has(intent.profileId)
      || (intent.type === "reorder" && !ids.has(intent.targetId));
    if (missing) {
      issues.push({
        code: "collectionTargetMissing",
        field: "relayProfiles",
        message: "目标供应商不存在，集合操作已停止。",
        blocking: true,
      });
    }
    if (intent.type === "duplicate" && ids.has(intent.id)) {
      issues.push({
        code: "duplicateProfileId",
        field: "id",
        message: `供应商 ID「${intent.id}」已存在，请使用新的 ID。`,
        blocking: true,
      });
    }
  }
  return issues;
}

function switchIssueForDraft(draft: RelayProfileDraft): RelayProfileIssue | null {
  if (draft.relayMode === "aggregate") {
    if (draft.aggregate?.members.length) return null;
    return aggregateMembersRequiredIssue();
  }
  if (draft.relayMode === "official" && !draft.officialMixApiKey) return null;
  if (!draft.configContents.trim()) {
    return {
      code: "storedConfigRequired",
      field: "configContents",
      message: `供应商「${draft.name || draft.id}」缺少独立 config.toml，已停止切换，避免继续显示上一套配置文件。请先在该供应商详情里保存 config.toml。`,
      blocking: true,
    };
  }
  if (draft.relayMode !== "official" || !authHasApiKey(draft.authContents)) return null;
  return {
    code: "officialMixedAuthApiKey",
    field: "authContents",
    message: "官方混合 API 不应在 auth.json 中保存 OPENAI_API_KEY。请清理此供应商的 auth.json 后再切换。",
    blocking: true,
  };
}

function authHasApiKey(contents: string): boolean {
  const trimmed = contents.trim();
  if (!trimmed) return false;
  try {
    const value = JSON.parse(trimmed) as { OPENAI_API_KEY?: unknown };
    return typeof value?.OPENAI_API_KEY === "string" && value.OPENAI_API_KEY.trim().length > 0;
  } catch {
    return /"OPENAI_API_KEY"\s*:/.test(trimmed);
  }
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
    issues.push(aggregateMembersRequiredIssue());
  }
  return issues;
}

function aggregateMembersRequiredIssue(): RelayProfileIssue {
  return {
    code: "aggregateMembersRequired",
    field: "aggregate.members",
    message: "聚合供应商至少需要勾选 1 个已填写 Base URL / Key 的 API 供应商。",
    blocking: true,
  };
}

function normalizeAggregate(
  aggregate: RelayAggregateConfig | null | undefined,
  sourceId: string,
  profiles: RelayProfile[],
): RelayAggregateConfig {
  const candidates = new Set(
    aggregateCandidatesFor(sourceId, profiles).map((profile) => profile.id),
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

function aggregateCandidatesFor(sourceId: string, profiles: RelayProfile[]): RelayProfileCandidate[] {
  return profiles
    .filter(
      (profile): profile is RelayProfile & { relayMode: RelayProfileCandidate["relayMode"] } =>
        profile.id !== sourceId &&
        profile.relayMode !== "aggregate" &&
        !profile.aggregate &&
        Boolean(profile.baseUrl.trim() && profile.apiKey.trim()),
    )
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      relayMode: profile.relayMode,
      protocol: profile.protocol,
      baseUrl: profile.baseUrl,
      officialMixApiKey: profile.officialMixApiKey,
    }));
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
      nativeImageGenerationEnabled: false,
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
      nativeImageGenerationEnabled: false,
      configContents: "",
      authContents: removeAuthApiKey(draft.authContents),
    };
  }

  const nativeImageGenerationEnabled = draft.protocol === "responses"
    && draft.relayMode === "pureApi"
    && draft.nativeImageGenerationEnabled;
  const configContents = projectConfig({ ...draft, nativeImageGenerationEnabled });
  if (draft.relayMode === "pureApi") {
    return {
      ...draft,
      nativeImageGenerationEnabled,
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
    nativeImageGenerationEnabled: false,
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
