import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesheet = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const match = stylesheet.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Expected ${selector} CSS rule`);
  return match[1];
}

test("access-mode field is above animated sibling fields when its combobox is open", () => {
  const modeRule = ruleBody(".relay-field-mode");
  const modeZIndex = Number(modeRule.match(/z-index:\s*(-?\d+)/)?.[1]);

  assert.match(modeRule, /position:\s*relative/);
  assert.ok(Number.isFinite(modeZIndex) && modeZIndex > 0, "the mode field needs a positive stacking order");
  assert.match(ruleBody(".relay-combobox-menu"), /z-index:\s*40/);
});
