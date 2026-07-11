import assert from "node:assert/strict";
import test from "node:test";

import { loadInitialRoute } from "./routes.ts";

test("opens about when the update query flag is set", () => {
  assert.equal(loadInitialRoute({ search: "?showUpdate=1", hash: "" }), "about");
});

test("opens about for the about hash", () => {
  assert.equal(loadInitialRoute({ search: "", hash: "#about" }), "about");
});

test("opens overview for every other startup location", () => {
  assert.equal(loadInitialRoute({ search: "?showUpdate=0", hash: "#settings" }), "overview");
  assert.equal(loadInitialRoute({ search: "", hash: "" }), "overview");
});
