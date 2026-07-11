import {
  removeContextEntryFromSelections,
  setContextEntryEnabled,
  type ContextEntry,
  type ContextKind,
  type ContextProfileSelection,
} from "./config.ts";

export type ContextChange =
  | { type: "save"; kind: ContextKind; id: string; tomlBody: string }
  | { type: "toggle"; entry: ContextEntry }
  | { type: "delete"; kind: ContextKind; id: string };

export type ContextOperationResult<Settings> = {
  status?: string;
  message?: string;
  settings: Settings;
};
export type ContextStatusResult = {
  status?: string;
  message?: string;
};

export type ContextMutationPorts<
  Settings,
  PersistedResult extends ContextOperationResult<Settings> = ContextOperationResult<Settings>,
  LiveResult extends ContextStatusResult = ContextStatusResult,
> = {
  upsert: (
    settings: Settings,
    kind: ContextKind,
    id: string,
    tomlBody: string,
  ) => Promise<ContextOperationResult<Settings> | null>;
  delete: (
    settings: Settings,
    kind: ContextKind,
    id: string,
  ) => Promise<ContextOperationResult<Settings> | null>;
  persist: (settings: Settings) => Promise<PersistedResult | null>;
  commitPersisted: (result: PersistedResult) => void;
  syncLive: (settings: Settings) => Promise<LiveResult | null>;
  commitLive: (result: LiveResult) => void;
  refreshRelayFiles: () => Promise<void>;
  reportFailure: (result: { status?: string; message?: string }) => void;
};

export type ContextMutationController<Settings> = {
  apply: (settings: Settings, change: ContextChange) => Promise<Settings | null>;
};

export function createContextMutationController<
  Settings extends { relayProfiles: Array<ContextProfileSelection> },
  PersistedResult extends ContextOperationResult<Settings> = ContextOperationResult<Settings>,
  LiveResult extends ContextStatusResult = ContextStatusResult,
>(ports: ContextMutationPorts<Settings, PersistedResult, LiveResult>): ContextMutationController<Settings> {
  let busy = false;

  return {
    apply: async (settings, change) => {
      if (busy)
        return null;
      busy = true;
      try {
        const mutation = await runMutation(ports, settings, change);
        if (!mutation)
          return null;
        if (!isSuccessfulStatus(mutation.status)) {
          ports.reportFailure(mutation);
          return null;
        }

        const mutatedSettings = change.type === "delete"
          ? removeContextEntryFromSelections(mutation.settings, change.kind, change.id)
          : mutation.settings;
        const persisted = await ports.persist(mutatedSettings);
        if (!persisted)
          return null;
        if (!isSuccessfulStatus(persisted.status)) {
          ports.reportFailure(persisted);
          return null;
        }
        ports.commitPersisted(persisted);

        if (change.type !== "save") {
          const synced = await ports.syncLive(persisted.settings);
          if (synced) {
            if (!isSuccessfulStatus(synced.status)) {
              ports.reportFailure(synced);
              return persisted.settings;
            }
            ports.commitLive(synced);
            await ports.refreshRelayFiles();
          }
        }
        return persisted.settings;
      } finally {
        busy = false;
      }
    },
  };
}

function runMutation<Settings>(
  ports: Pick<ContextMutationPorts<Settings>, "upsert" | "delete">,
  settings: Settings,
  change: ContextChange,
): Promise<ContextOperationResult<Settings> | null> {
  if (change.type === "delete")
    return ports.delete(settings, change.kind, change.id);
  if (change.type === "toggle") {
    const entry = change.entry;
    return ports.upsert(
      settings,
      entry.kind,
      entry.id,
      setContextEntryEnabled(entry.tomlBody, !entry.enabled),
    );
  }
  return ports.upsert(settings, change.kind, change.id, change.tomlBody);
}

function isSuccessfulStatus(status?: string): boolean {
  return status === "ok" || status === "accepted";
}
