import assert from "node:assert/strict";
import test from "node:test";

import { splitLogLines } from "./presentation.ts";

test("removes trailing blank log lines", () => {
  assert.deepEqual(splitLogLines("first\nsecond\n\n"), ["first", "second"]);
  assert.deepEqual(splitLogLines(""), []);
});

test("preserves blank log lines inside the report", () => {
  assert.deepEqual(splitLogLines("\nfirst\n\nsecond"), ["", "first", "", "second"]);
});

test("preserves non-empty whitespace within log lines", () => {
  assert.deepEqual(splitLogLines("first\n  \nsecond"), ["first", "  ", "second"]);
});
