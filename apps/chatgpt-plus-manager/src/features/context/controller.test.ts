import assert from "node:assert/strict";
import test from "node:test";

import { createContextMutationController } from "./controller.ts";

type Settings = {
  relayContextConfigContents: string;
  revision: number;
  relayProfiles: Array<{
    id: string;
    contextSelection: { mcpServers: string[]; skills: string[]; plugins: string[] };
    concrete: string;
  }>;
};

const settings = (): Settings => ({
  relayContextConfigContents: "",
  revision: 1,
  relayProfiles: [
    {
      id: "one",
      contextSelection: { mcpServers: ["live-only", "keep"], skills: [], plugins: [] },
      concrete: "preserve",
    },
  ],
});

test("failed delete reports the failure and performs no cleanup or downstream effects", async () => {
  const source = settings();
  const calls: string[] = [];
  const controller = createContextMutationController<Settings>({
    upsert: async () => { throw new Error("unexpected upsert"); },
    delete: async () => {
      calls.push("delete");
      return { status: "failed", message: "cannot delete", settings: { ...source, revision: 99 } };
    },
    persist: async () => { calls.push("persist"); return null; },
    commitPersisted: () => { calls.push("commitPersisted"); },
    syncLive: async () => { calls.push("sync"); return { status: "ok" }; },
    commitLive: () => { calls.push("commitLive"); },
    refreshRelayFiles: async () => { calls.push("refresh"); },
    reportFailure: (result) => calls.push(`report:${result.message}`),
  });

  const result = await controller.apply(source, { type: "delete", kind: "mcp", id: "live-only" });

  assert.equal(result, null);
  assert.deepEqual(source.relayProfiles[0]!.contextSelection.mcpServers, ["live-only", "keep"]);
  assert.deepEqual(calls, ["delete", "report:cannot delete"]);
});

test("successful live-only delete cleans selections and orders delete, persist, sync, refresh", async () => {
  const source = settings();
  const calls: string[] = [];
  const controller = createContextMutationController<Settings>({
    upsert: async () => { throw new Error("unexpected upsert"); },
    delete: async (_settings, kind, id) => {
      calls.push(`delete:${kind}:${id}`);
      return { status: "ok", settings: source };
    },
    persist: async (next) => {
      calls.push("persist");
      assert.deepEqual(next.relayProfiles[0]!.contextSelection.mcpServers, ["keep"]);
      assert.equal(next.relayProfiles[0]!.concrete, "preserve");
      return { status: "ok", settings: { ...next, revision: 2 } };
    },
    commitPersisted: () => { calls.push("commitPersisted"); },
    syncLive: async (next) => { calls.push(`sync:${next.revision}`); return { status: "accepted" }; },
    commitLive: () => { calls.push("commitLive"); },
    refreshRelayFiles: async () => { calls.push("refresh"); },
    reportFailure: () => { throw new Error("unexpected failure"); },
  });

  const result = await controller.apply(source, { type: "delete", kind: "mcp", id: "live-only" });

  assert.equal(result?.revision, 2);
  assert.deepEqual(calls, [
    "delete:mcp:live-only",
    "persist",
    "commitPersisted",
    "sync:2",
    "commitLive",
    "refresh",
  ]);
});

test("toggle derives the next TOML body and orders upsert, persist, sync, refresh", async () => {
  const source = settings();
  const calls: string[] = [];
  const controller = createContextMutationController<Settings>({
    upsert: async (_settings, kind, id, tomlBody) => {
      calls.push(`upsert:${kind}:${id}:${tomlBody.trim().replaceAll("\n", "|")}`);
      return { status: "ok", settings: source };
    },
    delete: async () => { throw new Error("unexpected delete"); },
    persist: async (next) => { calls.push("persist"); return { status: "ok", settings: { ...next, revision: 2 } }; },
    commitPersisted: () => { calls.push("commitPersisted"); },
    syncLive: async () => { calls.push("sync"); return { status: "ok" }; },
    commitLive: () => { calls.push("commitLive"); },
    refreshRelayFiles: async () => { calls.push("refresh"); },
    reportFailure: () => { throw new Error("unexpected failure"); },
  });

  const result = await controller.apply(source, {
    type: "toggle",
    entry: {
      id: "alpha",
      kind: "mcp",
      title: "alpha",
      summary: "",
      tomlBody: 'enabled = false\ncommand = "uv"\n',
      enabled: false,
    },
  });

  assert.equal(result?.revision, 2);
  assert.deepEqual(calls, [
    'upsert:mcp:alpha:enabled = true|command = "uv"',
    "persist",
    "commitPersisted",
    "sync",
    "commitLive",
    "refresh",
  ]);
});

test("failed persistence reports without committing or starting live reconciliation", async () => {
  const source = settings();
  const calls: string[] = [];
  const controller = createContextMutationController<Settings>({
    upsert: async () => ({ status: "ok", settings: source }),
    delete: async () => { throw new Error("unexpected delete"); },
    persist: async () => { calls.push("persist"); return { status: "failed", message: "cannot persist", settings: source }; },
    commitPersisted: () => { calls.push("commitPersisted"); },
    syncLive: async () => { calls.push("sync"); return { status: "ok" }; },
    commitLive: () => { calls.push("commitLive"); },
    refreshRelayFiles: async () => { calls.push("refresh"); },
    reportFailure: (result) => { calls.push(`report:${result.message}`); },
  });

  const result = await controller.apply(source, { type: "toggle", entry: {
    id: "alpha", kind: "mcp", title: "alpha", summary: "", tomlBody: "", enabled: true,
  } });

  assert.equal(result, null);
  assert.deepEqual(calls, ["persist", "report:cannot persist"]);
});

test("failed live sync keeps persisted settings but does not commit live state or refresh", async () => {
  const source = settings();
  const calls: string[] = [];
  const controller = createContextMutationController<Settings>({
    upsert: async () => ({ status: "ok", settings: source }),
    delete: async () => { throw new Error("unexpected delete"); },
    persist: async () => ({ status: "ok", settings: { ...source, revision: 2 } }),
    commitPersisted: () => { calls.push("commitPersisted"); },
    syncLive: async () => { calls.push("sync"); return { status: "failed", message: "cannot sync" }; },
    commitLive: () => { calls.push("commitLive"); },
    refreshRelayFiles: async () => { calls.push("refresh"); },
    reportFailure: (result) => { calls.push(`report:${result.message}`); },
  });

  const result = await controller.apply(source, { type: "toggle", entry: {
    id: "alpha", kind: "mcp", title: "alpha", summary: "", tomlBody: "", enabled: true,
  } });

  assert.equal(result?.revision, 2);
  assert.deepEqual(calls, ["commitPersisted", "sync", "report:cannot sync"]);
});

test("a concurrent second mutation is ignored before any port can run in parallel", async () => {
  const source = settings();
  const calls: string[] = [];
  let releaseDelete: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => { releaseDelete = resolve; });
  const controller = createContextMutationController<Settings>({
    upsert: async () => { calls.push("upsert"); return { status: "ok", settings: source }; },
    delete: async () => { calls.push("delete:start"); await blocked; calls.push("delete:end"); return { status: "ok", settings: source }; },
    persist: async (next) => ({ status: "ok", settings: next }),
    commitPersisted: () => {},
    syncLive: async () => ({ status: "ok" }),
    commitLive: () => {},
    refreshRelayFiles: async () => {},
    reportFailure: () => {},
  });

  const first = controller.apply(source, { type: "delete", kind: "mcp", id: "live-only" });
  const second = await controller.apply(source, { type: "save", kind: "skill", id: "review", tomlBody: 'path = "/review"\n' });

  assert.equal(second, null);
  assert.deepEqual(calls, ["delete:start"]);
  releaseDelete?.();
  await first;
  assert.deepEqual(calls.slice(0, 2), ["delete:start", "delete:end"]);
  assert.equal(calls.includes("upsert"), false);
});
