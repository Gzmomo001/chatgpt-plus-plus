import assert from "node:assert/strict";
import test from "node:test";

import { loadInitialRoute, nextRelayListRequest } from "./routes.ts";

test("opens the unified settings page when the update query flag is set", () => {
  const location = { search: "?showUpdate=1", hash: "" };
  assert.equal(loadInitialRoute(location), "settings");
});

test("keeps the legacy about hash as a unified settings deep link", () => {
  const location = { search: "", hash: "#about" };
  assert.equal(loadInitialRoute(location), "settings");
});

test("opens Relay for every other startup location", () => {
  assert.equal(loadInitialRoute({ search: "?showUpdate=0", hash: "#settings" }), "relay");
  assert.equal(loadInitialRoute({ search: "", hash: "" }), "relay");
});

test("requests the Relay list when navigating to Relay again", () => {
  assert.equal(nextRelayListRequest("relay", 4), 5);
  assert.equal(nextRelayListRequest("sessions", 4), 4);
});
