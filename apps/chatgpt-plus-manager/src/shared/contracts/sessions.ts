export type LocalSession = {
  id: string;
  title: string;
  cwd: string;
  modelProvider: string;
  archived: boolean;
  updatedAtMs: number | null;
  rolloutPath: string;
  dbPath: string;
};

export type LocalSessionsResult = {
  status: string;
  message: string;
  dbPath: string;
  dbPaths: string[];
  sessions: LocalSession[];
};

export type DeleteLocalSessionResult = {
  status: string;
  message: string;
  sessionId: string;
  undoToken: string | null;
  backupPath: string | null;
};

export type ExportLocalSessionResult = {
  status: string;
  message: string;
  sessionId: string;
  filename: string | null;
  markdown: string | null;
};

export type TokenUsagePoint = {
  source: string;
  conversationId: string;
  turnId: string;
  observedAt: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens: number;
    contextUsed: number;
    contextLimit: number;
    hasBreakdown: boolean;
  };
};

export type LocalSessionUsageResult = {
  status: string;
  message: string;
  sessionId: string;
  rolloutPath: string | null;
  history: TokenUsagePoint[];
};

export type ProviderSyncTargetSource = "config" | "rollout" | "sqlite" | "manual";

export type ProviderSyncTargetOption = {
  id: string;
  sources: ProviderSyncTargetSource[];
  isCurrentProvider: boolean;
  isManual: boolean;
  isSaved: boolean;
};

export type ProviderSyncTargetsResult = {
  status: string;
  message: string;
  currentProvider: string;
  targets: ProviderSyncTargetOption[];
};

export type ProviderSyncProgressView = {
  active: boolean;
  percent: number;
  message: string;
};
