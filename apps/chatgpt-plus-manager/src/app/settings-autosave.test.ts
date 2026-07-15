import assert from "node:assert/strict";
import test from "node:test";

import { createSettingsAutosave } from "./settings-autosave.ts";

test("settings autosave debounces edits and persists only the latest value", async () => {
  let timerId = 0;
  const timers = new Map<number, () => void>();
  const saved: string[] = [];
  const states: string[] = [];
  const autosave = createSettingsAutosave<string, string>({
    delayMs: 400,
    save: async (value) => {
      saved.push(value);
      return value;
    },
    onSaved: () => {},
    onError: (error) => assert.fail(String(error)),
    onStateChange: (state) => states.push(state),
    scheduleTimer: (callback) => {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    cancelTimer: (id) => timers.delete(id as number),
  });

  autosave.schedule("first");
  autosave.schedule("latest");

  assert.deepEqual(saved, []);
  assert.equal(timers.size, 1);
  assert.deepEqual(states, ["pending"]);

  const callback = [...timers.values()][0];
  timers.clear();
  callback?.();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(saved, ["latest"]);
  assert.deepEqual(states, ["pending", "saving", "saved"]);
});

test("settings autosave serializes a newer edit behind an in-flight write", async () => {
  let timerId = 0;
  const timers = new Map<number, () => void>();
  const writes: string[] = [];
  const completed: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstWrite = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const autosave = createSettingsAutosave<string, string>({
    save: async (value) => {
      writes.push(value);
      if (value === "first") await firstWrite;
      return value;
    },
    onSaved: (result) => completed.push(result),
    onError: (error) => assert.fail(String(error)),
    onStateChange: () => {},
    scheduleTimer: (callback) => {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    cancelTimer: (id) => timers.delete(id as number),
  });

  autosave.schedule("first");
  const firstTimer = [...timers.values()][0];
  timers.clear();
  firstTimer?.();
  await Promise.resolve();
  assert.deepEqual(writes, ["first"]);

  autosave.schedule("second");
  const secondTimer = [...timers.values()][0];
  timers.clear();
  secondTimer?.();
  await Promise.resolve();
  assert.deepEqual(writes, ["first"]);

  releaseFirst?.();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(writes, ["first", "second"]);
  assert.deepEqual(completed, ["first", "second"]);
});
