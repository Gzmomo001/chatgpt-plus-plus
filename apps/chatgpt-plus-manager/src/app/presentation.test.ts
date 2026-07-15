import assert from "node:assert/strict";
import test from "node:test";

import {
  isSuccessStatus,
  loadInitialTheme,
  getNavigationRoutes,
  routeSubtitle,
  routeTitle,
  stringifyError,
} from "./presentation.ts";

test("projects every application route and its shell copy through one interface", () => {
  const navigationRoutes = getNavigationRoutes();
  assert.equal(navigationRoutes.length, 4);
  assert.deepEqual(
    navigationRoutes.map(({ id }) => id),
    [
      "settings",
      "relay",
      "sessions",
      "enhance",
    ],
  );
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
