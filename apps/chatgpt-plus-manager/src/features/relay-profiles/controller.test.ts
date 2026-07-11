import assert from "node:assert/strict";
import test from "node:test";

import {
  commitRelayChanges,
  runProviderDiagnosis,
  shouldRefreshRelayFiles,
} from "./controller.ts";
import { open } from "./editor.ts";
import type { RelayProfile, RelayProfileSettings } from "./types.ts";

const profile: RelayProfile = {
  id: "relay-a", name: "Relay A", model: "", baseUrl: "https://a.example/v1",
  upstreamBaseUrl: "https://a.example/v1", apiKey: "sk-a", protocol: "responses",
  relayMode: "pureApi", officialMixApiKey: false, testModel: "", configContents: "",
  authContents: "", useCommonConfig: true,
  contextSelection: { mcpServers: [], skills: [], plugins: [] },
  contextSelectionInitialized: true, contextWindow: "", autoCompactLimit: "",
  modelList: "", modelWindows: "{}", userAgent: "", aggregate: null,
};

test("commits Relay changes while preserving the caller's concrete settings", () => {
  const settings: RelayProfileSettings & { unrelated: { keep: boolean } } = {
    relayProfiles: [profile], activeRelayId: profile.id, relayBaseUrl: profile.baseUrl,
    relayApiKey: profile.apiKey, aggregateRelayProfiles: [], activeAggregateRelayId: "",
    unrelated: { keep: true },
  };
  const state = open({
    settings,
    defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
  });
  const result = commitRelayChanges(state, settings);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.settings.unrelated, { keep: true });

  const refinedSettings = { ...settings, activeRelayId: "relay-a" as const };
  const refinedResult = commitRelayChanges(state, refinedSettings);
  if (refinedResult.ok) {
    // @ts-expect-error Canonical Relay mutation must widen a caller's literal refinement.
    const stillRefined: "relay-a" = refinedResult.settings.activeRelayId;
    assert.equal(stillRefined, "relay-a");
  }
});

test("always clears Provider Doctor running state when diagnosis rejects", async () => {
  const transitions: Array<{ running: boolean }> = [];
  await assert.rejects(() => runProviderDiagnosis(
    profile,
    async () => { throw new Error("offline"); },
    (transition) => transitions.push(transition),
  ));
  assert.equal(transitions[0]?.running, true);
  assert.equal(transitions.at(-1)?.running, false);
});

test("refreshes Relay files only for an active persisted detail transition", () => {
  assert.equal(shouldRefreshRelayFiles({
    detailProfileId: "relay-a",
    isNewProfile: false,
    activeRelayId: "relay-a",
  }), true);
  assert.equal(shouldRefreshRelayFiles({
    detailProfileId: "relay-b",
    isNewProfile: false,
    activeRelayId: "relay-a",
  }), false);
  assert.equal(shouldRefreshRelayFiles({
    detailProfileId: "relay-a",
    isNewProfile: true,
    activeRelayId: "relay-a",
  }), false);
  assert.equal(shouldRefreshRelayFiles({
    detailProfileId: null,
    isNewProfile: false,
    activeRelayId: "relay-a",
  }), false);
});
