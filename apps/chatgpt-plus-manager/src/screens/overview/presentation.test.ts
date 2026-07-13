import assert from "node:assert/strict";
import test from "node:test";

import { detectLaunchCrash, projectOverviewHealth } from "./presentation.ts";
import type { OverviewResult } from "@/shared/contracts/overview";

const endpointHealth: OverviewResult = {
  status: "ok",
  message: "ready",
  codexApp: { status: "found", path: "/Applications/Codex.app" },
  codexVersion: "1.2.3",
  appShortcut: { status: "installed", path: "/tmp/ChatGPT++.lnk" },
  latestLaunch: null,
  currentVersion: "1.2.34",
  updateStatus: "not_checked",
  settingsPath: "/tmp/settings.json",
  logsPath: "/tmp/launch.json",
};

test("projects all Overview health rows through one interface", () => {
  assert.deepEqual(projectOverviewHealth(null), [
    { id: "codex-version", status: "not_checked", ok: false, detail: null },
    { id: "codex-app", status: "not_checked", ok: false, detail: null },
  ]);

  assert.deepEqual(projectOverviewHealth(endpointHealth), [
    { id: "codex-version", status: "ok", ok: true, detail: "1.2.3" },
    { id: "codex-app", status: "found", ok: true, detail: "/Applications/Codex.app" },
  ]);

  assert.deepEqual(
    projectOverviewHealth({
      ...endpointHealth,
      codexApp: { status: "missing", path: null },
      appShortcut: { status: "missing", path: null },
    }),
    [
      { id: "codex-version", status: "ok", ok: true, detail: "1.2.3" },
      { id: "codex-app", status: "missing", ok: false, detail: null },
    ],
  );
});

test("detects only running-to-terminal launch crashes and owns the notice copy", () => {
  for (const current of ["stopped", "failed", "crashed"]) {
    assert.deepEqual(detectLaunchCrash("running", current), {
      title: "Codex 意外停止",
      message: "进程状态：{0}。是否要重新启动？",
      messageArgs: [current],
      status: "failed",
    });
  }

  for (const [previous, current] of [
    [null, "crashed"],
    ["stopped", "failed"],
    ["running", "running"],
    ["running", null],
  ] as const) {
    assert.equal(detectLaunchCrash(previous, current), null);
  }
});
