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
