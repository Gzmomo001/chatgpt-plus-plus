import assert from "node:assert/strict";
import test from "node:test";

import {
  createUserScriptsActionRunner,
  type UserScriptsIntent,
} from "./controller.ts";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("suppresses duplicate installs synchronously until the first settles", async () => {
  const operation = deferred();
  const calls: UserScriptsIntent[] = [];
  const runner = createUserScriptsActionRunner({
    execute: (intent) => {
      calls.push(intent);
      return operation.promise;
    },
    pendingChanged: () => {},
  });

  const first = runner.execute({ type: "install", id: "alpha" });
  const duplicate = runner.execute({ type: "install", id: "alpha" });

  assert.equal(await duplicate, false);
  assert.deepEqual(calls, [{ type: "install", id: "alpha" }]);
  operation.resolve();
  assert.equal(await first, true);
});

test("guards toggle and delete of the same local script as one resource", async () => {
  const operation = deferred();
  const calls: UserScriptsIntent[] = [];
  const runner = createUserScriptsActionRunner({
    execute: (intent) => {
      calls.push(intent);
      return operation.promise;
    },
    pendingChanged: () => {},
  });

  const toggle = runner.execute({ type: "toggle", key: "local-a", enabled: false });
  const conflictingDelete = runner.execute({ type: "delete", key: "local-a" });

  assert.equal(await conflictingDelete, false);
  assert.deepEqual(calls, [{ type: "toggle", key: "local-a", enabled: false }]);
  operation.resolve();
  await toggle;
});

test("suppresses every second intent while another resource is in flight", async () => {
  const operation = deferred();
  const calls: UserScriptsIntent[] = [];
  const transitions: string[][] = [];
  const runner = createUserScriptsActionRunner({
    execute: (intent) => {
      calls.push(intent);
      return operation.promise;
    },
    pendingChanged: (pending) => transitions.push([...pending]),
  });

  const first = runner.execute({ type: "toggle", key: "local-a", enabled: false });
  const second = runner.execute({ type: "delete", key: "local-b" });

  operation.resolve();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult, true);
  assert.equal(secondResult, false);
  assert.deepEqual(calls, [
    { type: "toggle", key: "local-a", enabled: false },
  ]);
  assert.deepEqual(transitions, [["script:local-a"], []]);
});

test("clears pending state after rejection so the resource can retry", async () => {
  const transitions: string[][] = [];
  let attempts = 0;
  const runner = createUserScriptsActionRunner({
    execute: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
    },
    pendingChanged: (pending) => transitions.push([...pending]),
  });

  await assert.rejects(
    runner.execute({ type: "refreshMarket" }),
    /offline/,
  );
  assert.deepEqual(transitions, [["refresh:market"], []]);
  assert.equal(await runner.execute({ type: "refreshMarket" }), true);
  assert.equal(attempts, 2);
});
