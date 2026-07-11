export type ModelWindowRow = {
  model: string;
  window: string;
};

export type RelayProtocol = "responses" | "chatCompletions";
export type RelayMode = "official" | "mixedApi" | "pureApi" | "aggregate";
export type RelayAggregateStrategy =
  | "failover"
  | "conversationRoundRobin"
  | "requestRoundRobin"
  | "weightedRoundRobin";

export type RelayContextSelection = {
  mcpServers: string[];
  skills: string[];
  plugins: string[];
};

export type RelayAggregateMember = { profileId: string; weight: number };
export type RelayAggregateConfig = {
  strategy: RelayAggregateStrategy;
  members: RelayAggregateMember[];
};

export type AggregateRelayProfile = {
  id: string;
  name: string;
  strategy: RelayAggregateStrategy;
  members: Array<{ relayId: string; weight: number }>;
};

export type RelayProfile = {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
  upstreamBaseUrl: string;
  apiKey: string;
  protocol: RelayProtocol;
  relayMode: RelayMode;
  officialMixApiKey: boolean;
  testModel: string;
  configContents: string;
  authContents: string;
  useCommonConfig: boolean;
  contextSelection: RelayContextSelection;
  contextSelectionInitialized: boolean;
  contextWindow: string;
  autoCompactLimit: string;
  modelList: string;
  modelWindows: string;
  userAgent: string;
  aggregate?: RelayAggregateConfig | null;
};

export type RelayProfileDraft = Omit<RelayProfile, "modelList" | "modelWindows"> & {
  models: ModelWindowRow[];
};

export type RelayProfileSettings = {
  relayProfiles: RelayProfile[];
  activeRelayId: string;
  relayBaseUrl: string;
  relayApiKey: string;
  aggregateRelayProfiles: AggregateRelayProfile[];
  activeAggregateRelayId: string;
  [key: string]: unknown;
};

export type RelayProfileEditorContext = {
  profiles: RelayProfile[];
  activeRelayId: string;
  defaultContextSelection: RelayContextSelection;
  settings: RelayProfileSettings;
  liveFiles?: { configContents: string; authContents: string } | null;
};

export type RelayProfileIssue = {
  code: string;
  field: string;
  message: string;
  blocking: boolean;
};

export type RelayProfileEditorState = {
  sourceId: string;
  isNew: boolean;
  draft: RelayProfileDraft;
  issues: RelayProfileIssue[];
  context: RelayProfileEditorContext;
};

export type RelayProfilePatch = Partial<Omit<RelayProfileDraft, "models">>;

export type ApplyRelayProfilePresetIntent = {
  type: "applyPreset";
  preset: Pick<
    RelayProfile,
    "name" | "baseUrl" | "protocol" | "model" | "relayMode"
  > & {
    models: ModelWindowRow[];
  };
};

export type RelayProfileEdit =
  | { type: "patch"; patch: RelayProfilePatch }
  | ApplyRelayProfilePresetIntent
  | { type: "replaceModels"; models: ModelWindowRow[] }
  | { type: "mergeModels"; models: ModelWindowRow[] }
  | { type: "removeModel"; model: string }
  | { type: "replaceStoredFiles"; configContents: string; authContents: string }
  | { type: "setAggregate"; aggregate: RelayAggregateConfig };

export type RelayProfileCommitResult =
  | { ok: true; profile: RelayProfile; settings: RelayProfileSettings }
  | { ok: false; issues: RelayProfileIssue[] };

export type RelayProfileCollectionEdit =
  | { type: "activate"; profileId: string }
  | { type: "duplicate"; profileId: string; id: string; name: string }
  | { type: "reorder"; profileId: string; targetId: string }
  | { type: "remove"; profileId: string };
