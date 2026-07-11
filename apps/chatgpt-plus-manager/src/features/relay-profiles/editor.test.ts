import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  commit,
  editRelayProfileCollection,
  normalizeRelayProfileSettings,
  edit,
  open,
  seedRelayProfile,
} from "./editor.ts";
import { createPresetIntent } from "./preset-intent.ts";
import type {
  RelayProfile,
  RelayProfileEditorContext,
  RelayProfilePatch,
} from "./types.ts";
import { PRESETS } from "../../presets.ts";

if (false) {
  const patch: RelayProfilePatch = {};
  // @ts-expect-error Relay profile patches cannot advertise stored model fields.
  patch.modelList = "model-a";
  // @ts-expect-error Relay profile patches cannot advertise stored model-window fields.
  patch.modelWindows = "{}";
  // @ts-expect-error Relay profile patches cannot advertise structured model rows.
  patch.models = [];

  const source = profile();
  const opened = open(source, context([source]));
  // @ts-expect-error mixedApi is a persisted legacy mode, not an editable mode.
  edit(opened, { type: "setMode", mode: "mixedApi" });
}

function profile(patch: Partial<RelayProfile> = {}): RelayProfile {
  return {
    id: "relay-a",
    name: "Relay A",
    model: "model-a",
    baseUrl: "https://example.com/v1",
    upstreamBaseUrl: "https://example.com/v1",
    apiKey: "sk-a",
    protocol: "responses",
    relayMode: "pureApi",
    officialMixApiKey: false,
    testModel: "",
    configContents: [
      'model = "model-a"',
      'model_provider = "custom"',
      "",
      "[model_providers.custom]",
      'name = "custom"',
      'wire_api = "responses"',
      "requires_openai_auth = true",
      'base_url = "https://example.com/v1"',
      "",
    ].join("\n"),
    authContents: '{"OPENAI_API_KEY":"sk-a"}\n',
    useCommonConfig: true,
    contextSelection: { mcpServers: [], skills: [], plugins: [] },
    contextSelectionInitialized: true,
    contextWindow: "",
    autoCompactLimit: "",
    modelList: "model-a",
    modelWindows: "{}",
    userAgent: "",
    aggregate: null,
    ...patch,
  };
}

function context(profiles: RelayProfile[]): RelayProfileEditorContext {
  return {
    profiles,
    activeRelayId: profiles[0]?.id ?? "",
    defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
    settings: {
      relayProfiles: profiles,
      activeRelayId: profiles[0]?.id ?? "",
      relayBaseUrl: profiles[0]?.baseUrl ?? "",
      relayApiKey: profiles[0]?.apiKey ?? "",
      aggregateRelayProfiles: [],
      activeAggregateRelayId: "",
    },
  };
}

describe("Relay profile editor", () => {
  it("owns collection mutations and is the only production editor seam", () => {
    const source = profile();
    const settings = context([source]).settings;
    const activated = editRelayProfileCollection(settings, {
      type: "activate",
      profileId: source.id,
    });
    assert.equal(activated.activeRelayId, source.id);

    const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
    const editor = readFileSync(new URL("./editor.ts", import.meta.url), "utf8");
    const types = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
    const selector = readFileSync(
      new URL("./components/ProviderPresetSelector.tsx", import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      "deriveRelayProfileFromFiles",
      "applyRelayProfilePatchToFiles",
      "withGeneratedRelayFiles",
      "syncLegacyRelayFields",
      "normalizeAggregateRelayProfile",
      "normalizeAggregateConfig",
      "modelWindowRowsFromProfile",
      "serializeModelWindowRows",
      "mergeModelWindowRows",
      "relayProfileSwitchValidation",
      "relayProfileUsesLiveFiles",
      "aggregateMemberCandidates",
      "isApiRelayProfile",
      "clampAggregateWeight",
      "aggregateRelayProfileValidation",
      "isAggregateRelayProfile",
    ]) {
      assert.equal(app.includes(forbidden), false, `${forbidden} remains in App`);
    }
    assert.match(app, /RelayProfileEditorState/);
    assert.doesNotMatch(app, /from ["']\.\/model-windows["']/);
    assert.doesNotMatch(app, /patch as unknown as Partial<RelayProfile>/);
    assert.doesNotMatch(app, /type: "setAggregate", aggregate: next\.aggregate/);
    assert.doesNotMatch(app, /modelList: _modelList|modelWindows: _modelWindows/);
    assert.match(editor, /export function open\(/);
    assert.match(editor, /export function edit\(/);
    assert.match(editor, /export function commit\(/);
    assert.doesNotMatch(
      editor,
      /export function (?:openRelayProfileEditor|editRelayProfile|commitRelayProfile)\(/,
    );
    assert.equal(existsSync(new URL("../../relay-profile-editor.ts", import.meta.url)), false);
    assert.equal(existsSync(new URL("../../relay-profile-editor.test.ts", import.meta.url)), false);
    assert.equal(
      existsSync(new URL("../../components/ProviderPresetSelector.tsx", import.meta.url)),
      false,
    );
    assert.equal((types.match(/export type RelayProfile\s*=/g) ?? []).length, 1);
    assert.doesNotMatch(editor, /export type RelayProfile\s*=/);
    assert.doesNotMatch(selector, /(?:export )?type RelayProfile\s*=/);
  });

  it("ignores stored model fields smuggled through a generic patch", () => {
    const source = profile();
    const opened = open(source, context([source]));
    const edited = edit(opened, {
      type: "patch",
      patch: {
        name: "Patched",
        modelList: "smuggled-a\nsmuggled-b",
        modelWindows: '{"smuggled-b":"1M"}',
      } as unknown as RelayProfilePatch,
    });
    const committed = commit(edited);
    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.equal(committed.profile.name, "Patched");
    assert.equal(committed.profile.modelList, source.modelList);
    assert.equal(committed.profile.modelWindows, source.modelWindows);
  });

  it("applies a provider preset intent without losing its model metadata", () => {
    const source = profile();
    const opened = open(source, context([source]));
    const preset = PRESETS.find((candidate) => candidate.id === "deepseek");
    assert.ok(preset);
    const edited = edit(opened, createPresetIntent(preset));
    const committed = commit(edited);

    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.equal(committed.profile.name, preset.name);
    assert.equal(committed.profile.baseUrl, preset.baseUrl);
    assert.equal(committed.profile.upstreamBaseUrl, preset.baseUrl);
    assert.equal(committed.profile.protocol, preset.protocol);
    assert.equal(committed.profile.model, preset.model);
    assert.equal(committed.profile.testModel, preset.model);
    assert.equal(committed.profile.modelList, preset.modelList?.join("\n"));
    assert.equal(committed.profile.modelWindows, "{}");
    assert.equal(committed.profile.relayMode, "pureApi");
    assert.equal(committed.profile.officialMixApiKey, false);
  });

  it("seeds a normal provider as Official using the saved relay base URL", () => {
    const settings = context([profile()]).settings;
    settings.relayBaseUrl = "https://saved.example/v1";
    const seeded = seedRelayProfile(
      settings,
      "official",
      "new-official",
      "New provider",
      { mcpServers: [], skills: [], plugins: [] },
    );
    assert.equal(seeded.relayMode, "official");
    assert.equal(seeded.officialMixApiKey, false);
    assert.equal(seeded.baseUrl, "https://saved.example/v1");
    assert.equal(seeded.upstreamBaseUrl, "https://saved.example/v1");
  });

  it("normalizes backend aggregate hydration and legacy projections in one roundtrip", () => {
    const member = profile({ id: "member" });
    const aggregate = profile({ id: "aggregate", name: "", relayMode: "aggregate", aggregate: null });
    const settings = context([member, aggregate]).settings;
    settings.activeRelayId = "aggregate";
    settings.aggregateRelayProfiles = [{
      id: "aggregate",
      name: "Hydrated aggregate",
      strategy: "weightedRoundRobin",
      members: [{ relayId: "member", weight: 3 }],
    }];

    const normalized = normalizeRelayProfileSettings(settings, {
      mcpServers: ["filesystem"], skills: [], plugins: [],
    });

    const hydrated = normalized.relayProfiles.find((candidate) => candidate.id === "aggregate");
    assert.equal(hydrated?.name, "Hydrated aggregate");
    assert.deepEqual(hydrated?.aggregate?.members, [{ profileId: "member", weight: 3 }]);
    assert.equal(normalized.activeAggregateRelayId, "aggregate");
    assert.equal(normalized.relayBaseUrl, "http://127.0.0.1:57321/v1");
  });

  it("normalizes Official non-mixed snapshots without losing official auth tokens", () => {
    const official = profile({
      relayMode: "official",
      officialMixApiKey: false,
      configContents: 'model_provider = "custom"\n',
      authContents: '{"OPENAI_API_KEY":"sk-old","auth_mode":"chatgpt","tokens":{"access_token":"official"}}',
    });
    const settings = context([official]).settings;
    const normalized = normalizeRelayProfileSettings(settings, {
      mcpServers: [], skills: [], plugins: [],
    });
    const result = normalized.relayProfiles[0];
    assert.equal(result.configContents, "");
    assert.doesNotMatch(result.authContents, /OPENAI_API_KEY/);
    assert.match(result.authContents, /official/);
  });
  it("initializes an uninitialized context selection from the editor default", () => {
    const source = profile({
      contextSelectionInitialized: false,
      contextSelection: { mcpServers: ["stale"], skills: [], plugins: [] },
    });
    const ctx = context([source]);
    ctx.defaultContextSelection = {
      mcpServers: ["filesystem"],
      skills: ["review"],
      plugins: ["docs"],
    };

    const opened = open(source, ctx);
    assert.equal(opened.draft.contextSelectionInitialized, true);
    assert.deepEqual(opened.draft.contextSelection, ctx.defaultContextSelection);
    assert.notEqual(opened.draft.contextSelection, ctx.defaultContextSelection);
  });

  it("opens, edits immutably, and commits a Relay profile through one lifecycle", () => {
    const source = profile();
    const opened = open(source, context([source]));

    assert.deepEqual(opened.draft.models, [{ model: "model-a", window: "" }]);
    assert.equal("modelList" in opened.draft, false);
    assert.equal("modelWindows" in opened.draft, false);

    const edited = edit(opened, {
      type: "patch",
      patch: { name: "Relay A edited", apiKey: "sk-next" },
    });
    assert.equal(opened.draft.name, "Relay A");
    assert.equal(edited.draft.name, "Relay A edited");

    const committed = commit(edited);
    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.equal(committed.profile.name, "Relay A edited");
    assert.equal(committed.profile.apiKey, "sk-next");
    assert.match(committed.profile.authContents, /sk-next/);
    assert.equal(committed.settings.relayProfiles[0].name, "Relay A edited");
  });

  it("opens canonical model rows, migrates legacy suffixes, and only hydrates active existing profiles", () => {
    const active = profile({
      modelList: " model-a[1M] \nmodel-b\nmodel-a[1M]\nmodel-c[200K]",
      modelWindows: '{"model-b":"32000"}',
    });
    const ctx = {
      ...context([active]),
      liveFiles: {
        configContents: active.configContents.replace("model-a", "live-model"),
        authContents: '{"OPENAI_API_KEY":"sk-live"}\n',
      },
    };

    const opened = open(active, ctx);
    assert.deepEqual(opened.draft.models, [
      { model: "model-a", window: "1M" },
      { model: "model-b", window: "32000" },
      { model: "model-c", window: "200K" },
    ]);
    assert.equal(opened.draft.model, "live-model");
    assert.equal(opened.draft.apiKey, "sk-live");

    const draftOnly = profile({ id: "relay-new", model: "stored-model" });
    const newOpened = open(draftOnly, ctx);
    assert.equal(newOpened.isNew, true);
    assert.equal(newOpened.draft.model, "model-a");
    assert.equal(newOpened.draft.apiKey, "sk-a");
  });

  it("merges and removes model rows without mutating earlier editor states", () => {
    const source = profile({
      modelList: "model-a\nmodel-b",
      modelWindows: '{"model-a":"1M"}',
    });
    const opened = open(source, context([source]));
    const merged = edit(opened, {
      type: "mergeModels",
      models: [
        { model: " model-a ", window: "200K" },
        { model: "model-c", window: "32000" },
        { model: "model-c", window: "1M" },
      ],
    });
    const removed = edit(merged, { type: "removeModel", model: "model-b" });

    assert.deepEqual(opened.draft.models, [
      { model: "model-a", window: "1M" },
      { model: "model-b", window: "" },
    ]);
    assert.deepEqual(removed.draft.models, [
      { model: "model-a", window: "1M" },
      { model: "model-c", window: "32000" },
    ]);
    const committed = commit(removed);
    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.equal(committed.profile.modelList, "model-a\nmodel-c");
    assert.equal(
      committed.profile.modelWindows,
      '{"model-a":"1M","model-c":"32000"}',
    );
  });

  it("blocks commit when a model window is not empty or a positive integer/K/M token", () => {
    const source = profile({ modelList: "a\nb\nc", modelWindows: "{}" });
    const opened = open(source, context([source]));
    const invalid = edit(opened, {
      type: "replaceModels",
      models: [
        { model: "a", window: "0" },
        { model: "b", window: "1.5M" },
        { model: "c", window: "huge" },
      ],
    });

    const result = commit(invalid);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(
      result.issues.map((issue) => issue.field),
      ["models.a.window", "models.b.window", "models.c.window"],
    );
  });

  it("transitions mode through a dedicated intent before commit", () => {
    const source = profile();
    const opened = open(source, context([source]));
    const official = edit(opened, { type: "setMode", mode: "official" });
    const committed = commit(official);

    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.equal(committed.profile.relayMode, "official");
    assert.equal(committed.profile.officialMixApiKey, false);
    assert.equal(committed.profile.configContents, "");
    assert.doesNotMatch(committed.profile.authContents, /OPENAI_API_KEY/);
  });

  it("clears Aggregate config when transitioning to Official or Pure API", () => {
    const member = profile({ id: "relay-b" });
    const aggregate = profile({
      id: "aggregate-a",
      relayMode: "aggregate",
      aggregate: { strategy: "weightedRoundRobin", members: [{ profileId: member.id, weight: 3 }] },
    });
    const opened = open(aggregate, context([aggregate, member]));

    for (const mode of ["official", "pureApi"] as const) {
      const edited = edit(opened, { type: "setMode", mode });
      assert.equal(edited.draft.aggregate, null);
      const committed = commit(edited);
      assert.equal(committed.ok, true);
      if (!committed.ok) continue;
      assert.equal(committed.profile.aggregate, null);
    }
  });

  it("treats Aggregate-only intents as no-ops outside Aggregate mode", () => {
    const source = profile({ aggregate: null });
    let state = open(source, context([source]));
    const intents = [
      { type: "setAggregateStrategy", strategy: "weightedRoundRobin" },
      { type: "toggleAggregateMember", profileId: "relay-b", selected: true },
      { type: "setAggregateMemberWeight", profileId: "relay-b", weight: 12 },
    ] as const;

    for (const intent of intents) {
      const next = edit(state, intent);
      assert.strictEqual(next, state);
      state = next;
    }
    const committed = commit(state);
    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.equal(committed.profile.aggregate, null);
  });

  it("changes Aggregate strategy through a dedicated intent", () => {
    const member = profile({ id: "relay-b" });
    const aggregate = profile({
      id: "aggregate-a",
      relayMode: "aggregate",
      aggregate: { strategy: "failover", members: [{ profileId: member.id, weight: 1 }] },
    });
    const edited = edit(open(aggregate, context([aggregate, member])), {
      type: "setAggregateStrategy",
      strategy: "weightedRoundRobin",
    });
    const committed = commit(edited);

    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.equal(committed.profile.aggregate?.strategy, "weightedRoundRobin");
  });

  it("toggles an Aggregate member through a dedicated intent", () => {
    const member = profile({ id: "relay-b" });
    const aggregate = profile({
      id: "aggregate-a",
      relayMode: "aggregate",
      aggregate: { strategy: "failover", members: [] },
    });
    const selected = edit(open(aggregate, context([aggregate, member])), {
      type: "toggleAggregateMember",
      profileId: member.id,
      selected: true,
    });
    const committed = commit(selected);

    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.deepEqual(committed.profile.aggregate?.members, [
      { profileId: member.id, weight: 1 },
    ]);
  });

  it("clamps Aggregate member weight through a dedicated intent", () => {
    const member = profile({ id: "relay-b" });
    const aggregate = profile({
      id: "aggregate-a",
      relayMode: "aggregate",
      aggregate: { strategy: "weightedRoundRobin", members: [{ profileId: member.id, weight: 1 }] },
    });
    const edited = edit(open(aggregate, context([aggregate, member])), {
      type: "setAggregateMemberWeight",
      profileId: member.id,
      weight: 2000,
    });
    const committed = commit(edited);

    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.deepEqual(committed.profile.aggregate?.members, [
      { profileId: member.id, weight: 999 },
    ]);
  });

  it("returns Aggregate candidates and total weight as state semantic data", () => {
    const valid = profile({ id: "relay-valid" });
    const noKey = profile({ id: "relay-no-key", apiKey: "", authContents: "{}" });
    const nested = profile({
      id: "aggregate-nested",
      relayMode: "aggregate",
      aggregate: { strategy: "failover", members: [{ profileId: valid.id, weight: 1 }] },
    });
    const aggregate = profile({
      id: "aggregate-a",
      relayMode: "aggregate",
      aggregate: { strategy: "failover", members: [{ profileId: valid.id, weight: 3 }] },
    });
    const opened = open(aggregate, context([aggregate, valid, noKey, nested]));

    assert.deepEqual(
      opened.semantic?.aggregateCandidates.map((candidate) => candidate.id),
      ["relay-valid"],
    );
    assert.equal(opened.semantic?.aggregateTotalWeight, 3);
  });

  it("exposes Aggregate candidates as minimal detached DTOs", () => {
    const valid = profile({ id: "relay-valid", name: "Valid" });
    const aggregate = profile({
      id: "aggregate-a",
      relayMode: "aggregate",
      aggregate: { strategy: "failover", members: [{ profileId: valid.id, weight: 1 }] },
    });
    const opened = open(aggregate, context([aggregate, valid]));
    const candidate = opened.semantic.aggregateCandidates[0];

    assert.notStrictEqual(candidate, valid);
    assert.deepEqual(Object.keys(candidate).sort(), [
      "baseUrl",
      "id",
      "name",
      "officialMixApiKey",
      "protocol",
      "relayMode",
    ]);
    assert.equal("apiKey" in candidate, false);
    assert.equal("authContents" in candidate, false);
    assert.equal("configContents" in candidate, false);
  });

  it("returns uses-live-files and switch eligibility for every Relay mode", () => {
    const official = profile({
      id: "official",
      relayMode: "official",
      officialMixApiKey: false,
      configContents: "",
    });
    const pure = profile({ id: "pure", configContents: "" });
    const mixed = profile({
      id: "mixed",
      relayMode: "official",
      officialMixApiKey: true,
      authContents: '{"OPENAI_API_KEY":"sk-mixed"}\n',
    });
    const aggregate = profile({
      id: "aggregate",
      relayMode: "aggregate",
      aggregate: { strategy: "failover", members: [] },
    });
    const ctx = context([official, pure, mixed, aggregate]);

    const officialState = open(official, ctx);
    const pureState = open(pure, ctx);
    const mixedState = open(mixed, ctx);
    const aggregateState = open(aggregate, ctx);

    assert.equal(officialState.semantic.usesLiveFiles, false);
    assert.equal(officialState.semantic.switchIssue, null);
    assert.equal(pureState.semantic.usesLiveFiles, true);
    assert.equal(pureState.semantic.switchIssue?.code, "storedConfigRequired");
    assert.equal(mixedState.semantic.usesLiveFiles, true);
    assert.equal(mixedState.semantic.switchIssue?.code, "officialMixedAuthApiKey");
    assert.equal(aggregateState.semantic.usesLiveFiles, true);
    assert.equal(aggregateState.semantic.switchIssue?.code, "aggregateMembersRequired");
  });

  it("derives switch eligibility independently from save issues", () => {
    const official = profile({
      id: "official-invalid-window",
      relayMode: "official",
      officialMixApiKey: false,
      configContents: "",
      modelList: "model-a",
      modelWindows: '{"model-a":"invalid"}',
    });
    const pure = profile({
      id: "pure-invalid-window",
      relayMode: "pureApi",
      configContents: "",
      modelList: "model-a",
      modelWindows: '{"model-a":"invalid"}',
    });
    const ctx = context([official, pure]);

    const officialState = open(official, ctx);
    const pureState = open(pure, ctx);

    assert.equal(officialState.issues[0]?.code, "invalidModelWindow");
    assert.equal(officialState.semantic.switchIssue, null);
    assert.equal(pureState.issues[0]?.code, "invalidModelWindow");
    assert.equal(pureState.semantic.switchIssue?.code, "storedConfigRequired");
  });

  it("projects Official, Official mixed, Pure API, and Aggregate modes consistently", () => {
    const source = profile();
    const opened = open(source, context([source]));

    const official = edit(opened, { type: "setMode", mode: "official" });
    assert.equal(official.draft.configContents, "");
    assert.doesNotMatch(official.draft.authContents, /OPENAI_API_KEY/);

    const mixed = edit(official, {
      type: "patch",
      patch: {
        officialMixApiKey: true,
        baseUrl: "https://mixed.example/v1",
        apiKey: "sk-mixed",
        model: "mixed-model",
      },
    });
    assert.match(mixed.draft.configContents, /base_url = "https:\/\/mixed\.example\/v1"/);
    assert.match(mixed.draft.configContents, /experimental_bearer_token = "sk-mixed"/);
    assert.doesNotMatch(mixed.draft.authContents, /OPENAI_API_KEY/);

    const pure = edit(edit(mixed, { type: "setMode", mode: "pureApi" }), {
      type: "patch",
      patch: { apiKey: "sk-pure" },
    });
    assert.match(pure.draft.authContents, /sk-pure/);
    assert.doesNotMatch(pure.draft.configContents, /experimental_bearer_token/);

    const aggregate = edit(pure, { type: "setMode", mode: "aggregate" });
    assert.equal(aggregate.draft.relayMode, "aggregate");
    assert.equal(aggregate.draft.baseUrl, "");
    assert.equal(aggregate.draft.apiKey, "");
    assert.equal(aggregate.draft.configContents, "");
    assert.equal(aggregate.draft.authContents, "");
  });

  it("projects context limits as root integer keys and removes them when cleared", () => {
    const source = profile();
    const opened = open(source, context([source]));
    const configured = edit(opened, {
      type: "patch",
      patch: { contextWindow: "64K", autoCompactLimit: "50_000" },
    });
    assert.match(configured.draft.configContents, /^model_context_window = 64$/m);
    assert.match(
      configured.draft.configContents,
      /^model_auto_compact_token_limit = 50000$/m,
    );

    const cleared = edit(configured, {
      type: "patch",
      patch: { contextWindow: "", autoCompactLimit: "" },
    });
    assert.doesNotMatch(cleared.draft.configContents, /model_context_window/);
    assert.doesNotMatch(cleared.draft.configContents, /model_auto_compact_token_limit/);
  });

  it("replaces stored files and derives semantic fields from them", () => {
    const source = profile();
    const opened = open(source, context([source]));
    const replaced = edit(opened, {
      type: "replaceStoredFiles",
      configContents: [
        'model = "raw-model"',
        "model_context_window = 64000",
        "model_auto_compact_token_limit = 50000",
        'model_provider = "edge"',
        "",
        "[model_providers.edge]",
        'base_url = "https://raw.example/v1"',
        "",
      ].join("\n"),
      authContents: '{"OPENAI_API_KEY":"sk-raw"}\n',
    });

    assert.equal(replaced.draft.model, "raw-model");
    assert.equal(replaced.draft.baseUrl, "https://raw.example/v1");
    assert.equal(replaced.draft.apiKey, "sk-raw");
    assert.equal(replaced.draft.contextWindow, "64000");
    assert.equal(replaced.draft.autoCompactLimit, "50000");
  });

  it("normalizes Aggregate membership and blocks an empty Aggregate Relay profile", () => {
    const member = profile({ id: "relay-b", name: "Relay B" });
    const nested = profile({
      id: "aggregate-b",
      relayMode: "aggregate",
      aggregate: { strategy: "failover", members: [{ profileId: "relay-b", weight: 1 }] },
    });
    const aggregate = profile({
      id: "aggregate-a",
      relayMode: "aggregate",
      aggregate: { strategy: "failover", members: [] },
    });
    const ctx = context([aggregate, member, nested]);
    ctx.activeRelayId = aggregate.id;
    ctx.settings.activeRelayId = aggregate.id;
    const opened = open(aggregate, ctx);
    const selected = edit(opened, {
      type: "toggleAggregateMember",
      profileId: "relay-b",
      selected: true,
    });
    const edited = edit(selected, {
      type: "setAggregateMemberWeight",
      profileId: "relay-b",
      weight: 0,
    });
    assert.deepEqual(edited.draft.aggregate?.members, [{ profileId: "relay-b", weight: 1 }]);

    const empty = edit(edited, {
      type: "toggleAggregateMember",
      profileId: "relay-b",
      selected: false,
    });
    const result = commit(empty);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.issues[0].code, "aggregateMembersRequired");
    assert.equal(
      result.issues.find((issue) => issue.blocking)?.message,
      "聚合供应商至少需要勾选 1 个已填写 Base URL / Key 的 API 供应商。",
    );
  });

  it("excludes Relay profiles without both Base URL and API key from Aggregate membership", () => {
    const valid = profile({ id: "relay-valid" });
    const noUrl = profile({ id: "relay-no-url", baseUrl: "", upstreamBaseUrl: "" });
    const noKey = profile({ id: "relay-no-key", apiKey: "", authContents: "{}" });
    const aggregate = profile({
      id: "aggregate-a",
      relayMode: "aggregate",
      aggregate: { strategy: "failover", members: [] },
    });
    const ctx = context([aggregate, valid, noUrl, noKey]);
    const validSelected = edit(open(aggregate, ctx), {
      type: "toggleAggregateMember", profileId: "relay-valid", selected: true,
    });
    const noUrlSelected = edit(validSelected, {
      type: "toggleAggregateMember", profileId: "relay-no-url", selected: true,
    });
    const edited = edit(noUrlSelected, {
      type: "toggleAggregateMember", profileId: "relay-no-key", selected: true,
    });

    assert.deepEqual(edited.draft.aggregate?.members, [
      { profileId: "relay-valid", weight: 1 },
    ]);
  });

  it("commits active and Aggregate legacy projections while cleaning stale references", () => {
    const member = profile({ id: "relay-b", baseUrl: "https://b.example/v1", apiKey: "sk-b" });
    const aggregate = profile({
      id: "aggregate-a",
      name: "Aggregate A",
      relayMode: "aggregate",
      aggregate: {
        strategy: "failover",
        members: [
          { profileId: "relay-b", weight: 2 },
          { profileId: "relay-b", weight: 3 },
          { profileId: "missing", weight: 1 },
        ],
      },
    });
    const ctx = context([member, aggregate]);
    ctx.activeRelayId = aggregate.id;
    ctx.settings.activeRelayId = aggregate.id;
    const result = commit(open(aggregate, ctx));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.settings.activeRelayId, "aggregate-a");
    assert.equal(result.settings.relayBaseUrl, "http://127.0.0.1:57321/v1");
    assert.equal(result.settings.relayApiKey, "");
    assert.equal(result.settings.activeAggregateRelayId, "aggregate-a");
    assert.deepEqual(result.settings.aggregateRelayProfiles, [
      {
        id: "aggregate-a",
        name: "Aggregate A",
        strategy: "failover",
        members: [{ relayId: "relay-b", weight: 2 }],
      },
    ]);
  });
});
