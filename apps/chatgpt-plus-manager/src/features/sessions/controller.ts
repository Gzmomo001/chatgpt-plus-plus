import type {
  DeleteLocalSessionResult,
  LocalSession,
  LocalSessionsResult,
} from "../../shared/contracts/sessions.ts";

export type SessionsControllerView = {
  dbPath: string | null;
  rows: readonly {
    id: string;
    title: string;
    cwd: string;
    modelProvider: string;
    archived: boolean;
    updatedAtMs: number | null;
  }[];
  selectedSessionIds: readonly string[];
  selectionMode: boolean;
  pendingOperation: "refresh" | "deleteOne" | "deleteSelection" | null;
};

export type SessionsIntent =
  | { type: "refresh"; silent?: boolean }
  | { type: "toggleSelection"; sessionId: string; selected: boolean }
  | { type: "selectAll" }
  | { type: "clearSelection" }
  | { type: "deleteSelection" }
  | { type: "deleteOne"; sessionId: string };

export type SessionsDeleteRequest = {
  kind: "single" | "bulk";
  sessions: readonly LocalSession[];
};

export type SessionsDeleteReport =
  | { kind: "single"; result: DeleteLocalSessionResult }
  | { kind: "bulk"; succeeded: number; failedTitles: string[] };

export type SessionsControllerPorts = {
  loadSessions: (silent: boolean) => Promise<LocalSessionsResult | null>;
  deleteSession: (session: LocalSession) => Promise<DeleteLocalSessionResult | null>;
  confirmDelete: (request: SessionsDeleteRequest) => Promise<boolean>;
  reportDelete: (report: SessionsDeleteReport) => void;
  viewChanged: (view: SessionsControllerView) => void;
};

export type SessionsController = {
  view: () => SessionsControllerView;
  refresh: (silent?: boolean) => Promise<LocalSessionsResult | null>;
  reset: () => void;
  execute: (intent: SessionsIntent) => Promise<void>;
};

const isSuccessStatus = (status: string) => status === "ok" || status === "accepted";

export function createSessionsController(ports: SessionsControllerPorts): SessionsController {
  let sessions: LocalSessionsResult | null = null;
  let selectedSessionIds = new Set<string>();
  let selectionMode = false;
  let pendingOperation: SessionsControllerView["pendingOperation"] = null;

  const view = (): SessionsControllerView => ({
    dbPath: sessions?.dbPath ?? null,
    rows: (sessions?.sessions ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      cwd: item.cwd,
      modelProvider: item.modelProvider,
      archived: item.archived,
      updatedAtMs: item.updatedAtMs,
    })),
    selectedSessionIds: [...selectedSessionIds],
    selectionMode,
    pendingOperation,
  });
  const publish = () => ports.viewChanged(view());

  const replaceSessions = (next: LocalSessionsResult) => {
    sessions = next;
    const availableIds = new Set(next.sessions.map((item) => item.id));
    selectedSessionIds = new Set(
      [...selectedSessionIds].filter((id) => availableIds.has(id)),
    );
    publish();
  };

  const load = async (silent: boolean) => {
    const result = await ports.loadSessions(silent);
    if (result) replaceSessions(result);
    return result;
  };

  const refresh = async (silent = false) => {
    if (pendingOperation) return null;
    pendingOperation = "refresh";
    publish();
    try {
      return await load(silent);
    } finally {
      pendingOperation = null;
      publish();
    }
  };

  const findSession = (sessionId: string) =>
    sessions?.sessions.find((item) => item.id === sessionId);

  const deleteOne = async (sessionId: string) => {
    const item = findSession(sessionId);
    if (!item || pendingOperation) return;
    pendingOperation = "deleteOne";
    publish();
    try {
      if (!(await ports.confirmDelete({ kind: "single", sessions: [item] }))) return;
      const result = await ports.deleteSession(item);
      if (!result) return;
      ports.reportDelete({ kind: "single", result });
      await load(true);
    } finally {
      pendingOperation = null;
      publish();
    }
  };

  const deleteSelection = async () => {
    if (!selectionMode) {
      selectionMode = true;
      publish();
      return;
    }
    if (pendingOperation) return;
    const selected =
      sessions?.sessions.filter((item) => selectedSessionIds.has(item.id)) ?? [];
    if (!selected.length) return;

    pendingOperation = "deleteSelection";
    publish();
    try {
      if (!(await ports.confirmDelete({ kind: "bulk", sessions: selected }))) return;
      let succeeded = 0;
      const failedTitles: string[] = [];
      for (const item of selected) {
        const result = await ports.deleteSession(item);
        if (result && isSuccessStatus(result.status)) {
          succeeded += 1;
        } else {
          failedTitles.push(item.title || item.id);
        }
      }
      ports.reportDelete({ kind: "bulk", succeeded, failedTitles });
      await load(true);
    } finally {
      pendingOperation = null;
      publish();
    }
  };

  const execute = async (intent: SessionsIntent) => {
    switch (intent.type) {
      case "refresh":
        await refresh(intent.silent);
        return;
      case "toggleSelection":
        if (pendingOperation) return;
        if (!findSession(intent.sessionId)) return;
        if (intent.selected) selectedSessionIds.add(intent.sessionId);
        else selectedSessionIds.delete(intent.sessionId);
        publish();
        return;
      case "selectAll":
        if (pendingOperation) return;
        selectionMode = true;
        selectedSessionIds = new Set(
          sessions?.sessions.map((item) => item.id) ?? [],
        );
        publish();
        return;
      case "clearSelection":
        if (pendingOperation) return;
        selectedSessionIds.clear();
        publish();
        return;
      case "deleteSelection":
        await deleteSelection();
        return;
      case "deleteOne":
        await deleteOne(intent.sessionId);
    }
  };

  const reset = () => {
    selectionMode = false;
    selectedSessionIds.clear();
    publish();
  };

  return { view, refresh, reset, execute };
}
