import assert from "node:assert/strict";
import test from "node:test";

import { numberOrDefault } from "./settings.ts";

test("parses launch port values and falls back for invalid input", () => {
  assert.equal(numberOrDefault("57321", 1), 57321);
  assert.equal(numberOrDefault("invalid", 57321), 57321);
});
