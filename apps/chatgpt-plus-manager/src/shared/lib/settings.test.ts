import assert from "node:assert/strict";
import test from "node:test";

import { clampNumber, normalizeImageOverlayFitMode } from "./settings.ts";

test("clamps and rounds finite numbers within inclusive boundaries", () => {
  assert.equal(clampNumber(-1, 0, 6), 0);
  assert.equal(clampNumber(7, 0, 6), 6);
  assert.equal(clampNumber(0, 0, 6), 0);
  assert.equal(clampNumber(6, 0, 6), 6);
  assert.equal(clampNumber(2.6, 0, 6), 3);
});

test("maps non-finite numbers to the lower boundary", () => {
  assert.equal(clampNumber(Number.NaN, 100, 4000), 100);
  assert.equal(clampNumber(Number.POSITIVE_INFINITY, 100, 4000), 100);
  assert.equal(clampNumber(Number.NEGATIVE_INFINITY, 100, 4000), 100);
});

test("preserves every supported image overlay fit mode", () => {
  for (const mode of ["fill", "fit", "stretch", "tile", "center"] as const) {
    assert.equal(normalizeImageOverlayFitMode(mode), mode);
  }
});

test("normalizes missing and unsupported image overlay fit modes to fit", () => {
  assert.equal(normalizeImageOverlayFitMode(undefined), "fit");
  assert.equal(normalizeImageOverlayFitMode("crop"), "fit");
  assert.equal(normalizeImageOverlayFitMode(""), "fit");
});
