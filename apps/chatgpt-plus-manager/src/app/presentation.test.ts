import assert from "node:assert/strict";
import test from "node:test";

import {
  isSuccessStatus,
  loadInitialTheme,
  navigationRoutes,
  routeSubtitle,
  routeTitle,
  stringifyError,
} from "./presentation.ts";

test("projects every application route and its shell copy through one interface", () => {
  assert.equal(navigationRoutes.length, 9);
  assert.deepEqual(
    navigationRoutes.map(({ id }) => id),
    [
      "overview",
      "relay",
      "sessions",
      "context",
      "enhance",
      "recommendations",
      "maintenance",
      "about",
      "settings",
    ],
  );
  assert.equal(routeTitle("context"), "工具与插件");
  assert.equal(routeSubtitle("context"), "独立管理 MCP、Skills、Plugins");
});

test("owns application theme, status, and error presentation policy", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Reflect.deleteProperty(globalThis, "window");
    assert.equal(loadInitialTheme(), "dark");

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem(key: string) {
            return key === "codex-plus-theme" ? "light" : null;
          },
        },
      },
    });
    assert.equal(loadInitialTheme(), "light");
    assert.equal(isSuccessStatus("ok"), true);
    assert.equal(isSuccessStatus("accepted"), true);
    assert.equal(isSuccessStatus("failed"), false);
    assert.equal(stringifyError(new Error("boom")), "boom");
    assert.equal(stringifyError("plain"), "plain");
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
