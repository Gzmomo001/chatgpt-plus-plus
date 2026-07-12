import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionsController,
  type SessionsControllerView,
  type SessionsDeleteReport,
} from "./controller.ts";
import type {
  DeleteLocalSessionResult,
  LocalSession,
  LocalSessionsResult,
} from "../../shared/contracts/sessions.ts";

const session = (id: string, title = id): LocalSession => ({
  id,
  title,
  cwd: `/work/${id}`,
  modelProvider: "custom",
  archived: false,
  updatedAtMs: 1,
  rolloutPath: `/rollouts/${id}.jsonl`,
  dbPath: "/data/state.db",
});

const inventory = (sessions: LocalSession[]): LocalSessionsResult => ({
  status: "ok",
  message: "loaded",
  dbPath: "/data/state.db",
  dbPaths: ["/data/state.db"],
  sessions,
});

const deleted = (id: string, status = "ok"): DeleteLocalSessionResult => ({
  status,
  message: status,
  sessionId: id,
  undoToken: null,
  backupPath: null,
});

function harness(initial: LocalSession[]) {
  let nextInventory = inventory(initial);
  const deletedIds: string[] = [];
  const confirmations: Array<{ kind: "single" | "bulk"; ids: string[] }> = [];
  const reports: SessionsDeleteReport[] = [];
  const views: SessionsControllerView[] = [];
  const loadSilents: boolean[] = [];
  let confirmationAllowed = true;
  const deleteStatuses = new Map<string, string>();
  const controller = createSessionsController({
    loadSessions: async (silent) => {
      loadSilents.push(silent);
      return nextInventory;
    },
    deleteSession: async (item) => {
      deletedIds.push(item.id);
      return deleted(item.id, deleteStatuses.get(item.id) ?? "ok");
    },
    confirmDelete: async (request) => {
      confirmations.push({
        kind: request.kind,
        ids: request.sessions.map((item) => item.id),
      });
      return confirmationAllowed;
    },
    reportDelete: (report) => reports.push(report),
    viewChanged: (view) => views.push(view),
  });
  return {
    controller,
    deletedIds,
    confirmations,
    reports,
    views,
    loadSilents,
    setInventory: (sessions: LocalSession[]) => {
      nextInventory = inventory(sessions);
    },
    allowConfirmation: (allowed: boolean) => {
      confirmationAllowed = allowed;
    },
    setDeleteStatus: (id: string, status: string) => {
      deleteStatuses.set(id, status);
    },
  };
}

test("refresh owns inventory replacement and prunes selections that disappeared", async () => {
  const fixture = harness([session("one"), session("two")]);
  await fixture.controller.refresh(true);
  await fixture.controller.execute({ type: "toggleSelection", sessionId: "one", selected: true });
  await fixture.controller.execute({ type: "toggleSelection", sessionId: "two", selected: true });

  fixture.setInventory([session("two")]);
  await fixture.controller.refresh(true);

  assert.deepEqual(fixture.controller.view().selectedSessionIds, ["two"]);
  assert.deepEqual(fixture.controller.view().rows.map((item) => item.id), ["two"]);
});

test("bulk delete enters selection mode, deletes selected sessions serially, reports, and refreshes", async () => {
  const fixture = harness([session("one"), session("two"), session("three")]);
  await fixture.controller.refresh(true);

  await fixture.controller.execute({ type: "deleteSelection" });
  assert.equal(fixture.controller.view().selectionMode, true);
  assert.deepEqual(fixture.deletedIds, []);

  await fixture.controller.execute({ type: "toggleSelection", sessionId: "one", selected: true });
  await fixture.controller.execute({ type: "toggleSelection", sessionId: "three", selected: true });
  fixture.setInventory([session("two")]);
  await fixture.controller.execute({ type: "deleteSelection" });

  assert.deepEqual(fixture.confirmations, [{ kind: "bulk", ids: ["one", "three"] }]);
  assert.deepEqual(fixture.deletedIds, ["one", "three"]);
  assert.deepEqual(fixture.reports, [{ kind: "bulk", succeeded: 2, failedTitles: [] }]);
  assert.equal(fixture.controller.view().pendingOperation, null);
  assert.deepEqual(fixture.controller.view().selectedSessionIds, []);
  assert.ok(fixture.views.some((view) => view.pendingOperation === "deleteSelection"));
});

test("single delete confirms the requested session and refreshes only after success", async () => {
  const fixture = harness([session("one", "First")]);
  await fixture.controller.refresh(true);
  fixture.setInventory([]);

  await fixture.controller.execute({ type: "deleteOne", sessionId: "one" });

  assert.deepEqual(fixture.confirmations, [{ kind: "single", ids: ["one"] }]);
  assert.deepEqual(fixture.deletedIds, ["one"]);
  assert.deepEqual(fixture.reports, [{ kind: "single", result: deleted("one") }]);
  assert.deepEqual(fixture.controller.view().rows, []);
});

test("select all and clear selection are expressed through the controller interface", async () => {
  const fixture = harness([session("one"), session("two")]);
  await fixture.controller.refresh(true);

  await fixture.controller.execute({ type: "selectAll" });
  assert.equal(fixture.controller.view().selectionMode, true);
  assert.deepEqual(fixture.controller.view().selectedSessionIds, ["one", "two"]);

  await fixture.controller.execute({ type: "clearSelection" });
  assert.deepEqual(fixture.controller.view().selectedSessionIds, []);
});

test("one pending operation blocks every overlapping async operation", async () => {
  let releaseLoad!: (value: LocalSessionsResult) => void;
  let loadCalls = 0;
  const views: SessionsControllerView[] = [];
  const deletedIds: string[] = [];
  const controller = createSessionsController({
    loadSessions: () => {
      loadCalls += 1;
      if (loadCalls > 1) return Promise.resolve(inventory([session("one")]));
      return new Promise((resolve) => { releaseLoad = resolve; });
    },
    deleteSession: async (item) => { deletedIds.push(item.id); return deleted(item.id); },
    confirmDelete: async () => true,
    reportDelete: () => {},
    viewChanged: (view) => views.push(view),
  });

  const refreshing = controller.refresh();
  await controller.execute({ type: "deleteOne", sessionId: "one" });
  const secondRefresh = await controller.refresh();

  assert.equal(secondRefresh, null);
  assert.deepEqual(deletedIds, []);
  assert.equal(controller.view().pendingOperation, "refresh");
  releaseLoad(inventory([session("one")]));
  await refreshing;
  assert.equal(controller.view().pendingOperation, null);
  assert.ok(views.some((view) => view.pendingOperation === "refresh"));
});

test("reset restores the route-local selection lifecycle", async () => {
  const fixture = harness([session("one"), session("two")]);
  await fixture.controller.refresh(true);
  await fixture.controller.execute({ type: "selectAll" });

  fixture.controller.reset();

  assert.equal(fixture.controller.view().selectionMode, false);
  assert.deepEqual(fixture.controller.view().selectedSessionIds, []);
  assert.deepEqual(Object.keys(fixture.controller).sort(), ["execute", "refresh", "reset", "view"]);
});

test("cancelled confirmation clears pending without deleting or refreshing", async () => {
  const fixture = harness([session("one")]);
  await fixture.controller.refresh(false);
  fixture.allowConfirmation(false);

  await fixture.controller.execute({ type: "deleteOne", sessionId: "one" });

  assert.deepEqual(fixture.deletedIds, []);
  assert.deepEqual(fixture.reports, []);
  assert.deepEqual(fixture.loadSilents, [false]);
  assert.equal(fixture.controller.view().pendingOperation, null);
});

test("single failure is reported and followed by a silent authoritative refresh", async () => {
  const fixture = harness([session("one")]);
  await fixture.controller.refresh(false);
  fixture.setDeleteStatus("one", "failed");

  await fixture.controller.execute({ type: "deleteOne", sessionId: "one" });

  assert.deepEqual(fixture.reports, [{ kind: "single", result: deleted("one", "failed") }]);
  assert.deepEqual(fixture.loadSilents, [false, true]);
});

test("bulk partial failure preserves serial order and reports failed titles", async () => {
  const fixture = harness([session("one", "First"), session("two", "Second")]);
  await fixture.controller.refresh(true);
  await fixture.controller.execute({ type: "selectAll" });
  fixture.setDeleteStatus("two", "failed");

  await fixture.controller.execute({ type: "deleteSelection" });

  assert.deepEqual(fixture.deletedIds, ["one", "two"]);
  assert.deepEqual(fixture.reports, [{ kind: "bulk", succeeded: 1, failedTitles: ["Second"] }]);
  assert.deepEqual(fixture.loadSilents, [true, true]);
});
