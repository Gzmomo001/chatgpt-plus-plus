import assert from "node:assert/strict";
import test from "node:test";

import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const TOTAL_SESSIONS = 500;
const MAX_INITIAL_ROWS = 50;

test("session management keeps its first render bounded for large inventories", async () => {
  const server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { SessionsScreen } = await server.ssrLoadModule(
      "/src/screens/sessions/SessionsScreen.tsx",
    );
    const rows = Array.from({ length: TOTAL_SESSIONS }, (_, index) => ({
      id: `session-${index}`,
      title: `Session ${index}`,
      cwd: `/workspace/${index}`,
      modelProvider: "custom",
      archived: false,
      updatedAtMs: index,
    }));
    const idleAction = async () => {};
    const html = renderToStaticMarkup(createElement(SessionsScreen, {
      view: {
        dbPath: "/data/state.sqlite",
        rows,
        selectedSessionIds: [],
        selectionMode: false,
        pendingOperation: null,
        exportResult: null,
        providerSync: {
          active: false,
        },
      },
      actions: {
        refreshSessions: idleAction,
        toggleSessionSelection: idleAction,
        selectAllSessions: idleAction,
        clearSessionSelection: idleAction,
        deleteSelectedSessions: idleAction,
        deleteSession: idleAction,
        exportSession: idleAction,
        syncProvidersNow: idleAction,
      },
    }));

    const renderedRows = html.match(/class="session-row"/g)?.length ?? 0;
    assert.ok(
      renderedRows <= MAX_INITIAL_ROWS,
      `first render created ${renderedRows} session rows`,
    );
    assert.match(html, new RegExp(`>${TOTAL_SESSIONS} 个<`));
  } finally {
    await server.close();
  }
});
