import assert from "node:assert/strict";
import test from "node:test";

import {
  codexExtraArgsToInput,
  inputToCodexExtraArgs,
  providerTestModelOptions,
} from "./presentation.ts";

test("renders Codex extra arguments as one line per array entry", () => {
  assert.equal(codexExtraArgsToInput(undefined), "");
  assert.equal(codexExtraArgsToInput([]), "");
  assert.equal(codexExtraArgsToInput(["--first", "--second=value"]), "--first\n--second=value");
});

test("parses LF and CRLF Codex extra argument lines", () => {
  assert.deepEqual(inputToCodexExtraArgs("--first\n--second"), ["--first", "--second"]);
  assert.deepEqual(inputToCodexExtraArgs("--first\r\n--second"), ["--first", "--second"]);
});

test("keeps the exactly empty Codex argument input as an empty array", () => {
  assert.deepEqual(inputToCodexExtraArgs(""), []);
});

test("preserves empty and whitespace-only Codex argument lines", () => {
  assert.deepEqual(inputToCodexExtraArgs("--first\n\n  \n--last"), ["--first", "", "  ", "--last"]);
});

test("preserves leading and trailing whitespace in Codex argument lines", () => {
  assert.deepEqual(inputToCodexExtraArgs("  --first  \n --second"), ["  --first  ", " --second"]);
});

test("keeps the current manual test model alongside the fetched provider union", () => {
  assert.deepEqual(
    providerTestModelOptions(
      ["zeta-model", "shared-model", "alpha-model", "shared-model"],
      "manual-fallback",
    ),
    ["alpha-model", "manual-fallback", "shared-model", "zeta-model"],
  );
});
