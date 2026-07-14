import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  commit,
  edit,
  open as openRequest,
} from "./editor.ts";
import { createPresetIntent } from "./preset-intent.ts";
import type {
  RelayProfile,
  RelayProfileEditorContext,
  RelayProfilePatch,
} from "./types.ts";
import { PRESETS } from "../../presets.ts";

function openExisting(source: RelayProfile, editorContext: RelayProfileEditorContext) {
  return openRequest({
    settings: editorContext.settings,
    defaultContextSelection: editorContext.defaultContextSelection,
    focus: { type: "existing", profileId: source.id },
    liveFiles: editorContext.liveFiles,
  });
}

if (false) {
  const patch: RelayProfilePatch = {};
  // @ts-expect-error Relay profile patches cannot advertise stored model fields.
  patch.modelList = "model-a";
  // @ts-expect-error Relay profile patches cannot advertise stored model-window fields.
  patch.modelWindows = "{}";
  // @ts-expect-error Relay profile patches cannot advertise structured model rows.
  patch.models = [];

  const source = profile();
  const opened = openExisting(source, context([source]));
  // @ts-expect-error Relay profile previews are deeply readonly.
  opened.preview.profile.name = "mutated";
  // @ts-expect-error Relay profile preview context arrays are readonly.
  opened.preview.profile.contextSelection.skills.push("mutated");
  if (opened.preview.profile.aggregate) {
    // @ts-expect-error Relay profile preview Aggregate members are readonly.
    opened.preview.profile.aggregate.members.push({ profileId: "mutated", weight: 1 });
  }
  // @ts-expect-error mixedApi is a persisted legacy mode, not an editable mode.
  edit(opened, { type: "setMode", mode: "mixedApi" });
}

type RelayProfileFixturePatch = {
  [Key in keyof RelayProfile]?: RelayProfile[Key];
};

function profile(patch: RelayProfileFixturePatch = {}): RelayProfile {
  return {
    id: "relay-a",
    name: "Relay A",
    model: "model-a",
    baseUrl: "https://example.com/v1",
    upstreamBaseUrl: "https://example.com/v1",
    apiKey: "sk-a",
    protocol: "responses",
    nativeImageGenerationEnabled: false,
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
  it("keeps Relay profile switching available without a master switch", () => {
    const relayScreen = readFileSync(
      new URL("../../screens/relay-profiles/RelayProfilesScreen.tsx", import.meta.url),
      "utf8",
    );
    const relayDetail = readFileSync(
      new URL("./components/RelayProfileDetail.tsx", import.meta.url),
      "utf8",
    );
    const relayEditor = readFileSync(
      new URL("./components/RelayProfileEditor.tsx", import.meta.url),
      "utf8",
    );

    for (const source of [relayScreen, relayDetail, relayEditor]) {
      assert.doesNotMatch(source, /relayProfilesEnabled|供应商配置总开关/);
    }
    assert.doesNotMatch(relayScreen, /启用供应商配置切换|relay-master-switch/);
    assert.match(relayScreen, /disabled=\{actions\.relaySwitching\}/);
    assert.match(relayEditor, /disabled=\{actions\.relaySwitching\}/);
  });

  it("owns collection mutations and is the only production editor seam", () => {
    const source = profile();
    const settings = context([source]).settings;
    const activated = commit(edit(openExisting(source, context([source])), {
      type: "activate",
      profileId: source.id,
    }));
    assert.equal(activated.ok, true);

    const app = readFileSync(new URL("../../app/App.tsx", import.meta.url), "utf8");
    const relayScreen = readFileSync(
      new URL("../../screens/relay-profiles/RelayProfilesScreen.tsx", import.meta.url),
      "utf8",
    );
    const relayDetail = readFileSync(
      new URL("./components/RelayProfileDetail.tsx", import.meta.url),
      "utf8",
    );
    const editor = readFileSync(new URL("./editor.ts", import.meta.url), "utf8");
    const types = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
    const selector = readFileSync(
      new URL("./components/ProviderPresetSelector.tsx", import.meta.url),
      "utf8",
    );
    const removedCollectionEditor = ["editRelayProfile", "Collection"].join("");
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
      "normalizeRelayProfileSettings",
      "seedRelayProfile",
      "canonicalizeRelayProfile",
    ]) {
      assert.equal(app.includes(forbidden), false, `${forbidden} remains in App`);
    }
    assert.match(relayDetail, /RelayProfileEditorState/);
    assert.doesNotMatch(app, /from ["']\.\/model-windows["']/);
    assert.doesNotMatch(app, /patch as unknown as /);
    assert.doesNotMatch(app, /type: "setAggregate", aggregate: next\.aggregate/);
    assert.doesNotMatch(app, /model(List|Windows):\s+_[A-Za-z]+/);
    assert.equal(app.includes(removedCollectionEditor), false);
    assert.match(
      relayDetail,
      /focus:\s*isNew\s*\?\s*\{\s*type:\s*"create"/s,
      "RelayProfileDetail must keep temporary profiles on the create path",
    );
    assert.match(editor, /export function open\(/);
    assert.match(editor, /export function edit\(/);
    assert.match(editor, /export function commit\(/);
    assert.deepEqual(
      [...editor.matchAll(/export function (\w+)\(/g)].map((match) => match[1]),
      ["open", "edit", "commit"],
    );
    assert.doesNotMatch(editor, /relayProfileFromDraft/);
    assert.doesNotMatch(app, /relayProfileFromDraft/);
    assert.doesNotMatch(app, /preview\.profile\s+as\s+RelayProfile/);
    assert.equal(editor.includes(removedCollectionEditor), false);
    assert.doesNotMatch(
      editor,
      /export function (?:normalizeRelayProfileSettings|seedRelayProfile|canonicalizeRelayProfile)\(/,
    );
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

  it("activates through open, edit, and commit while projecting legacy fields", () => {
    const first = profile({ id: "first", baseUrl: "https://first.example/v1", apiKey: "sk-first" });
    const second = profile({
      id: "second",
      relayMode: "aggregate",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      aggregate: { strategy: "failover", members: [{ profileId: first.id, weight: 1 }] },
    });
    const ctx = context([first, second]);
    const result = commit(edit(openExisting(first, ctx), { type: "activate", profileId: second.id }));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.effect, { type: "switchProfile", profileId: second.id });
    assert.equal(result.settings.activeRelayId, second.id);
    assert.equal(result.settings.activeAggregateRelayId, second.id);
    assert.equal(result.settings.relayBaseUrl, "http://127.0.0.1:57321/v1");
    assert.equal(result.settings.relayApiKey, "");
  });

  it("duplicates a canonical profile immediately after its source", () => {
    const source = profile({ id: "source", modelList: "model-a\nmodel-a\nmodel-b" });
    const tail = profile({ id: "tail" });
    const result = commit(edit(openExisting(source, context([source, tail])), {
      type: "duplicate",
      profileId: source.id,
      id: "copy",
      name: "Copy",
    }));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.effect, { type: "updateSettings" });
    assert.deepEqual(result.settings.relayProfiles.map((candidate) => candidate.id), ["source", "copy", "tail"]);
    assert.equal(result.settings.relayProfiles[1].name, "Copy");
    assert.equal(result.settings.relayProfiles[1].modelList, "model-a\nmodel-b");
  });

  it("blocks duplicate id collisions without changing settings", () => {
    const source = profile({ id: "source" });
    const occupied = profile({ id: "occupied" });
    const settings = context([source, occupied]).settings;
    const snapshot = structuredClone(settings);
    const edited = edit(openRequest({
      settings,
      defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
      focus: { type: "existing", profileId: source.id },
    }), { type: "duplicate", profileId: source.id, id: occupied.id, name: "Collision" });
    const result = commit(edited);

    assert.equal(edited.issues.some((issue) => issue.code === "duplicateProfileId" && issue.blocking), true);
    assert.equal(result.ok, false);
    assert.deepEqual(settings, snapshot);
  });

  it("reorders profiles while preserving the active profile and legacy projection", () => {
    const first = profile({ id: "first" });
    const second = profile({ id: "second" });
    const third = profile({ id: "third" });
    const ctx = context([first, second, third]);
    ctx.activeRelayId = second.id;
    ctx.settings.activeRelayId = second.id;
    const result = commit(edit(openExisting(first, ctx), {
      type: "reorder",
      profileId: third.id,
      targetId: first.id,
    }));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.effect, { type: "updateSettings" });
    assert.deepEqual(result.settings.relayProfiles.map((candidate) => candidate.id), ["third", "first", "second"]);
    assert.equal(result.settings.activeRelayId, second.id);
    assert.equal(result.settings.relayBaseUrl, second.baseUrl);
  });

  it("removes the current draft without re-adding it and cleans aggregate references", () => {
    const removed = profile({ id: "removed" });
    const fallback = profile({ id: "fallback", baseUrl: "https://fallback.example/v1", apiKey: "sk-fallback" });
    const aggregate = profile({
      id: "aggregate",
      relayMode: "aggregate",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      aggregate: {
        strategy: "weightedRoundRobin",
        members: [
          { profileId: removed.id, weight: 2 },
          { profileId: fallback.id, weight: 3 },
        ],
      },
    });
    const ctx = context([removed, fallback, aggregate]);
    const result = commit(edit(openExisting(removed, ctx), { type: "remove", profileId: removed.id }));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.effect, { type: "updateSettings" });
    assert.deepEqual(result.settings.relayProfiles.map((candidate) => candidate.id), ["fallback", "aggregate"]);
    assert.equal(result.settings.activeRelayId, fallback.id);
    assert.deepEqual(result.settings.aggregateRelayProfiles[0].members, [
      { relayId: fallback.id, weight: 3 },
    ]);
  });

  it("removes the current profile even when its discarded draft is invalid", () => {
    const invalidAggregate = profile({
      id: "invalid-aggregate",
      relayMode: "aggregate",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      aggregate: { strategy: "failover", members: [] },
    });
    const fallback = profile({ id: "fallback" });
    const aggregateResult = commit(edit(
      openExisting(invalidAggregate, context([invalidAggregate, fallback])),
      { type: "remove", profileId: invalidAggregate.id },
    ));

    assert.equal(aggregateResult.ok, true);
    if (!aggregateResult.ok) return;
    assert.deepEqual(aggregateResult.effect, { type: "updateSettings" });
    assert.deepEqual(aggregateResult.settings.relayProfiles.map((candidate) => candidate.id), [fallback.id]);

    const invalidWindow = profile({
      id: "invalid-window",
      modelWindows: '{"model-a":"not-a-window"}',
    });
    const referringAggregate = profile({
      id: "referring-aggregate",
      relayMode: "aggregate",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      aggregate: {
        strategy: "failover",
        members: [{ profileId: invalidWindow.id, weight: 2 }],
      },
    });
    const windowResult = commit(edit(
      openExisting(invalidWindow, context([invalidWindow, fallback, referringAggregate])),
      { type: "remove", profileId: invalidWindow.id },
    ));

    assert.equal(windowResult.ok, true);
    if (!windowResult.ok) return;
    assert.equal(windowResult.settings.relayProfiles.some((candidate) => candidate.id === invalidWindow.id), false);
    assert.deepEqual(
      windowResult.settings.relayProfiles.find((candidate) => candidate.id === referringAggregate.id)?.aggregate?.members,
      [],
    );
  });

  it("keeps draft validation when removing a different profile", () => {
    const invalidCurrent = profile({
      id: "invalid-current",
      modelWindows: '{"model-a":"not-a-window"}',
    });
    const removed = profile({ id: "removed" });
    const settings = context([invalidCurrent, removed]).settings;
    const snapshot = structuredClone(settings);
    const result = commit(edit(openExisting(invalidCurrent, context([invalidCurrent, removed])), {
      type: "remove",
      profileId: removed.id,
    }));

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues.some((issue) => issue.code === "invalidModelWindow"), true);
    }
    assert.deepEqual(settings, snapshot);
  });

  it("discards an occupied-id create draft without deleting the persisted profile", () => {
    const existing = profile({
      id: "relay-a",
      name: "Persisted Relay",
      configContents: profile().configContents.replace("model-a", "persisted-model"),
      model: "persisted-model",
      modelList: "persisted-model",
      apiKey: "sk-persisted",
      authContents: '{"OPENAI_API_KEY":"sk-persisted"}\n',
    });
    const settings = context([existing]).settings;
    const snapshot = structuredClone(settings);
    const opened = openRequest({
      settings,
      defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
      focus: {
        type: "create",
        id: existing.id,
        name: "Unsaved Collision",
        mode: "official",
      },
    });
    const result = commit(edit(opened, { type: "remove", profileId: existing.id }));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.effect, { type: "updateSettings" });
    assert.equal(result.settings.activeRelayId, existing.id);
    assert.deepEqual(result.settings.relayProfiles, [existing]);
    assert.deepEqual(settings, snapshot);
  });

  it("blocks missing collection targets without mutating inputs", () => {
    const source = profile({ id: "source" });
    const settings = context([source]).settings;
    const snapshot = structuredClone(settings);
    for (const intent of [
      { type: "activate" as const, profileId: "missing" },
      { type: "duplicate" as const, profileId: "missing", id: "copy", name: "Copy" },
      { type: "reorder" as const, profileId: source.id, targetId: "missing" },
      { type: "remove" as const, profileId: "missing" },
    ]) {
      const result = commit(edit(openRequest({
        settings,
        defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
        focus: { type: "existing", profileId: source.id },
      }), intent));
      assert.equal(result.ok, false, intent.type);
      if (!result.ok) {
        assert.equal(result.issues.some((issue) => issue.code === "collectionTargetMissing" && issue.blocking), true);
      }
      assert.deepEqual(settings, snapshot);
    }
  });

  it("saves a dirty detail draft and activates it in one commit", () => {
    const first = profile({ id: "first" });
    const second = profile({ id: "second", name: "Before" });
    const ctx = context([first, second]);
    const dirty = edit(openExisting(second, ctx), { type: "patch", patch: { name: "After" } });
    const result = commit(edit(dirty, { type: "activate", profileId: second.id }));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.effect, { type: "switchProfile", profileId: second.id });
    assert.equal(result.profile.name, "After");
    assert.equal(result.settings.relayProfiles.find((candidate) => candidate.id === second.id)?.name, "After");
    assert.equal(result.settings.activeRelayId, second.id);
  });

  it("ignores stored model fields smuggled through a generic patch", () => {
    const source = profile();
    const opened = openExisting(source, context([source]));
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
    const opened = openExisting(source, context([source]));
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
    const defaultContextSelection = {
      mcpServers: ["filesystem"], skills: ["review"], plugins: ["docs"],
    };
    const opened = openRequest({
      settings,
      defaultContextSelection,
      focus: {
        type: "create",
        id: "new-official",
        name: "New provider",
        mode: "official",
      },
    });
    const seeded = commit(opened);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    assert.equal(seeded.profile.relayMode, "official");
    assert.equal(seeded.profile.officialMixApiKey, false);
    assert.equal(seeded.profile.baseUrl, "https://saved.example/v1");
    assert.equal(seeded.profile.upstreamBaseUrl, "https://saved.example/v1");
    assert.deepEqual(seeded.profile.contextSelection, defaultContextSelection);
  });

  it("always opens a draft when backend settings contain no profiles", () => {
    const settings = context([]).settings;
    settings.relayBaseUrl = "https://saved.example/v1";

    const opened = openRequest({
      settings,
      defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
    });

    assert.equal(opened.isNew, true);
    assert.equal(opened.draft.id, "default");
    assert.equal(opened.draft.baseUrl, "https://saved.example/v1");
  });

  it("reopens a temporary create profile without replacing the active existing profile", () => {
    const active = profile({ id: "active", name: "Active" });
    const settings = context([active]).settings;
    settings.relayBaseUrl = "https://saved.example/v1";
    const defaultContextSelection = {
      mcpServers: ["filesystem"], skills: ["review"], plugins: [],
    };
    const temporary = openRequest({
      settings,
      defaultContextSelection,
      focus: { type: "create", id: "temporary", name: "Temporary", mode: "official" },
    }).preview.profile;

    const detailState = openRequest({
      settings,
      defaultContextSelection,
      focus: {
        type: "create",
        id: temporary.id,
        name: temporary.name,
        mode: temporary.relayMode === "mixedApi" ? "official" : temporary.relayMode,
      },
    });
    const saved = commit(detailState);

    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.settings.activeRelayId, active.id);
    assert.deepEqual(saved.settings.relayProfiles.map((candidate) => candidate.id), [
      active.id,
      temporary.id,
    ]);
    assert.equal(saved.profile.name, temporary.name);
    assert.equal(saved.profile.relayMode, temporary.relayMode);
    assert.deepEqual(saved.profile.contextSelection, defaultContextSelection);
    assert.equal(saved.profile.baseUrl, "https://saved.example/v1");
  });

  it("blocks a create focus whose id is already occupied without mutating settings", () => {
    const existing = profile({ id: "relay-a" });
    const settings = context([existing]).settings;
    const snapshot = structuredClone(settings);
    const opened = openRequest({
      settings,
      defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
      focus: { type: "create", id: existing.id, name: "Duplicate", mode: "official" },
    });

    assert.equal(opened.issues.some((issue) =>
      issue.code === "duplicateProfileId" && issue.blocking
    ), true);
    const saved = commit(opened);
    assert.equal(saved.ok, false);
    if (saved.ok) return;
    assert.equal(saved.issues.some((issue) => issue.code === "duplicateProfileId"), true);
    assert.deepEqual(settings, snapshot);
    assert.equal(settings.relayProfiles.filter((candidate) => candidate.id === existing.id).length, 1);

    const existingState = openRequest({
      settings,
      defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
      focus: { type: "existing", profileId: existing.id },
    });
    assert.equal(existingState.issues.some((issue) => issue.code === "duplicateProfileId"), false);
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

    const normalized = openRequest({
      settings,
      defaultContextSelection: { mcpServers: ["filesystem"], skills: [], plugins: [] },
    }).context.settings;

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
    const normalized = openRequest({
      settings,
      defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
    }).context.settings;
    const result = normalized.relayProfiles[0];
    assert.equal(result.configContents, "");
    assert.doesNotMatch(result.authContents, /OPENAI_API_KEY/);
    assert.match(result.authContents, /official/);
  });

  it("seeds an Aggregate without hydrating it from active live files", () => {
    const settings = context([profile()]).settings;
    const opened = openRequest({
      settings,
      defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
      focus: { type: "create", id: "aggregate-new", name: "Aggregate", mode: "aggregate" },
      liveFiles: {
        configContents: 'model = "live-model"\n',
        authContents: '{"OPENAI_API_KEY":"sk-live"}\n',
      },
    });

    assert.equal(opened.isNew, true);
    assert.equal(opened.draft.relayMode, "aggregate");
    assert.deepEqual(opened.draft.aggregate, { strategy: "failover", members: [] });
    assert.equal(opened.draft.model, "");
    assert.equal(opened.draft.apiKey, "");
    assert.equal(opened.draft.configContents, "");
  });

  it("hydrates live files only for an active existing profile that semantically uses them", () => {
    const official = profile({
      id: "official",
      relayMode: "official",
      officialMixApiKey: false,
      model: "stored-official",
      configContents: "",
    });
    const active = profile({ id: "active", model: "stored-active" });
    const settings = context([official, active]).settings;
    settings.activeRelayId = active.id;
    const liveFiles = {
      configContents: active.configContents.replace("model-a", "live-model"),
      authContents: '{"OPENAI_API_KEY":"sk-live"}\n',
    };

    const activeState = openRequest({
      settings,
      defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
      focus: { type: "existing", profileId: active.id },
      liveFiles,
    });
    const officialState = openRequest({
      settings,
      defaultContextSelection: { mcpServers: [], skills: [], plugins: [] },
      focus: { type: "existing", profileId: official.id },
      liveFiles,
    });

    assert.equal(activeState.draft.model, "live-model");
    assert.equal(activeState.draft.apiKey, "sk-live");
    assert.equal(officialState.draft.model, "stored-official");
    assert.equal(officialState.draft.apiKey, "sk-a");
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

    const opened = openExisting(source, ctx);
    assert.equal(opened.draft.contextSelectionInitialized, true);
    assert.deepEqual(opened.draft.contextSelection, ctx.defaultContextSelection);
    assert.notEqual(opened.draft.contextSelection, ctx.defaultContextSelection);
  });

  it("opens, edits immutably, and commits a Relay profile through one lifecycle", () => {
    const source = profile();
    const opened = openExisting(source, context([source]));

    assert.deepEqual(opened.draft.models, [{ model: "model-a", window: "" }]);
    assert.equal("modelList" in opened.draft, false);
    assert.equal("modelWindows" in opened.draft, false);

    const edited = edit(opened, {
      type: "patch",
      patch: { name: "Relay A edited", apiKey: "sk-next" },
    });
    assert.equal(opened.draft.name, "Relay A");
    assert.equal(edited.draft.name, "Relay A edited");
    assert.notEqual(edited.preview, opened.preview);
    assert.equal(opened.preview.profile.name, "Relay A");
    assert.equal(edited.preview.profile.name, "Relay A edited");
    assert.notEqual(edited.preview.profile.contextSelection, edited.draft.contextSelection);

    const committed = commit(edited);
    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.equal(committed.profile.name, "Relay A edited");
    assert.equal(committed.profile.apiKey, "sk-next");
    assert.deepEqual(committed.effect, { type: "saveSettings" });
    assert.match(committed.profile.authContents, /sk-next/);
    assert.equal(committed.settings.relayProfiles[0].name, "Relay A edited");
  });

  it("opens with an immutable best-effort profile preview derived from model rows", () => {
    const source = profile({
      modelList: "model-a\nmodel-b",
      modelWindows: '{"model-a":"1M"}',
      aggregate: {
        strategy: "weightedRoundRobin",
        members: [{ profileId: "member", weight: 2 }],
      },
      contextSelection: { mcpServers: ["filesystem"], skills: ["review"], plugins: ["docs"] },
    });
    const opened = openExisting(source, context([source]));

    assert.equal(opened.preview.profile.modelList, "model-a\nmodel-b");
    assert.equal(opened.preview.profile.modelWindows, '{"model-a":"1M"}');
    assert.notEqual(opened.preview.profile.contextSelection, opened.draft.contextSelection);
    assert.notEqual(opened.preview.profile.aggregate, opened.draft.aggregate);
  });

  it("freezes the profile preview deeply without changing its draft", () => {
    const member = profile({ id: "member" });
    const source = profile({
      contextSelection: { mcpServers: ["filesystem"], skills: ["review"], plugins: ["docs"] },
      aggregate: {
        strategy: "weightedRoundRobin",
        members: [{ profileId: member.id, weight: 2 }],
      },
    });
    const opened = openExisting(source, context([source, member]));
    const snapshot = structuredClone(opened);
    const mutablePreview = opened.preview.profile as RelayProfile;

    assert.throws(() => { mutablePreview.name = "mutated"; }, TypeError);
    assert.throws(() => { mutablePreview.contextSelection.skills.push("mutated"); }, TypeError);
    assert.throws(
      () => { mutablePreview.aggregate?.members.push({ profileId: "mutated", weight: 1 }); },
      TypeError,
    );
    assert.deepEqual(opened, snapshot);
  });

  it("commits a mutable profile equal to the latest readonly preview", () => {
    const source = profile();
    const edited = edit(openExisting(source, context([source])), {
      type: "patch",
      patch: {
        name: "Latest",
        contextSelection: { mcpServers: ["one"], skills: ["two"], plugins: ["three"] },
      },
    });
    const committed = commit(edited);

    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.deepEqual(committed.profile, edited.preview.profile);
    assert.equal(Object.isFrozen(committed.profile), false);
  });

  it("refreshes the best-effort preview even when validation blocks commit", () => {
    const source = profile();
    const invalid = edit(openExisting(source, context([source])), {
      type: "replaceModels",
      models: [{ model: "adapter-model", window: "invalid" }],
    });

    assert.equal(invalid.preview.profile.modelList, "adapter-model");
    assert.equal(invalid.preview.profile.modelWindows, '{"adapter-model":"invalid"}');
    assert.equal(commit(invalid).ok, false);
  });

  it("keeps the preview synchronized after presets and stored-file replacements", () => {
    const source = profile();
    const preset = edit(openExisting(source, context([source])), {
      type: "applyPreset",
      preset: {
        name: "Preset",
        baseUrl: "https://preset.example/v1",
        protocol: "responses",
        model: "preset-model",
        relayMode: "pureApi",
        models: [{ model: "preset-model", window: "128K" }],
      },
    });
    assert.equal(preset.preview.profile.modelList, "preset-model");
    assert.equal(preset.preview.profile.modelWindows, '{"preset-model":"128K"}');

    const replaced = edit(preset, {
      type: "replaceStoredFiles",
      configContents: preset.draft.configContents.replace("preset-model", "file-model"),
      authContents: '{"OPENAI_API_KEY":"sk-file"}\n',
    });
    assert.equal(replaced.preview.profile.model, "file-model");
    assert.equal(replaced.preview.profile.apiKey, "sk-file");
    assert.equal(replaced.preview.profile.modelList, "preset-model");
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

    const opened = openExisting(active, ctx);
    assert.deepEqual(opened.draft.models, [
      { model: "model-a", window: "1M" },
      { model: "model-b", window: "32000" },
      { model: "model-c", window: "200K" },
    ]);
    assert.equal(opened.draft.model, "live-model");
    assert.equal(opened.draft.apiKey, "sk-live");

    const newOpened = openRequest({
      settings: ctx.settings,
      defaultContextSelection: ctx.defaultContextSelection,
      focus: { type: "create", id: "relay-new", name: "New", mode: "official" },
      liveFiles: ctx.liveFiles,
    });
    assert.equal(newOpened.isNew, true);
    assert.equal(newOpened.draft.model, "");
    assert.equal(newOpened.draft.apiKey, "");
  });

  it("round-trips compact model reasoning metadata and validates its default", () => {
    const source = profile({
      modelList: "model-a",
      modelWindows: '{"model-a":"1000000"}',
      modelSpecs: [{
        id: "model-a",
        context_window: 1_000_000,
        reasoning: { supported: ["low", "medium", "high"], default: "medium" },
      }],
    });
    const opened = openExisting(source, context([source]));
    assert.deepEqual(opened.draft.models, [{
      model: "model-a",
      window: "1000000",
      reasoningSupported: "low, medium, high",
      reasoningDefault: "medium",
    }]);

    const valid = edit(opened, {
      type: "replaceModels",
      models: [{
        model: "model-a",
        window: "1M",
        reasoningSupported: "low, high",
        reasoningDefault: "high",
      }],
    });
    const committed = commit(valid);
    assert.equal(committed.ok, true);
    if (!committed.ok) return;
    assert.deepEqual(committed.profile.modelSpecs, [{
      id: "model-a",
      context_window: 1_000_000,
      reasoning: { supported: ["low", "high"], default: "high" },
    }]);

    const invalid = edit(opened, {
      type: "replaceModels",
      models: [{
        model: "model-a",
        window: "1M",
        reasoningSupported: "low, high",
        reasoningDefault: "medium",
      }],
    });
    const rejected = commit(invalid);
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.equal(rejected.issues[0]?.code, "invalidDefaultReasoningEffort");
  });

  it("merges and removes model rows without mutating earlier editor states", () => {
    const source = profile({
      modelList: "model-a\nmodel-b",
      modelWindows: '{"model-a":"1M"}',
    });
    const opened = openExisting(source, context([source]));
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
    const opened = openExisting(source, context([source]));
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
    const opened = openExisting(source, context([source]));
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
    const opened = openExisting(aggregate, context([aggregate, member]));

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
    let state = openExisting(source, context([source]));
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
    assert.strictEqual(
      edit(state, { type: "unknown-at-runtime" } as unknown as Parameters<typeof edit>[1]),
      state,
    );
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
    const edited = edit(openExisting(aggregate, context([aggregate, member])), {
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
    const selected = edit(openExisting(aggregate, context([aggregate, member])), {
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
    const edited = edit(openExisting(aggregate, context([aggregate, member])), {
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
    const opened = openExisting(aggregate, context([aggregate, valid, noKey, nested]));

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
    const opened = openExisting(aggregate, context([aggregate, valid]));
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

    const officialState = openExisting(official, ctx);
    const pureState = openExisting(pure, ctx);
    const mixedState = openExisting(mixed, ctx);
    const aggregateState = openExisting(aggregate, ctx);

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

    const officialState = openExisting(official, ctx);
    const pureState = openExisting(pure, ctx);

    assert.equal(officialState.issues[0]?.code, "invalidModelWindow");
    assert.equal(officialState.semantic.switchIssue, null);
    assert.equal(pureState.issues[0]?.code, "invalidModelWindow");
    assert.equal(pureState.semantic.switchIssue?.code, "storedConfigRequired");
  });

  it("projects Official, Official mixed, Pure API, and Aggregate modes consistently", () => {
    const source = profile();
    const opened = openExisting(source, context([source]));

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
    const opened = openExisting(source, context([source]));
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
    const opened = openExisting(source, context([source]));
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
    const opened = openExisting(aggregate, ctx);
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
    const noUrl = profile({
      id: "relay-no-url",
      baseUrl: "",
      upstreamBaseUrl: "",
      configContents: "",
    });
    const noKey = profile({ id: "relay-no-key", apiKey: "", authContents: "{}" });
    const aggregate = profile({
      id: "aggregate-a",
      relayMode: "aggregate",
      aggregate: { strategy: "failover", members: [] },
    });
    const ctx = context([aggregate, valid, noUrl, noKey]);
    const validSelected = edit(openExisting(aggregate, ctx), {
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
    const result = commit(openExisting(aggregate, ctx));

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

  it("keeps native image generation only for a pure API Responses profile", () => {
    const source = profile({ nativeImageGenerationEnabled: true });
    const opened = openExisting(source, context([source]));
    assert.equal(opened.preview.profile.nativeImageGenerationEnabled, true);

    const chatCompletions = edit(opened, {
      type: "patch",
      patch: { protocol: "chatCompletions" },
    });
    assert.equal(chatCompletions.preview.profile.nativeImageGenerationEnabled, false);

    const responses = edit(chatCompletions, {
      type: "patch",
      patch: { protocol: "responses", nativeImageGenerationEnabled: true },
    });
    assert.equal(responses.preview.profile.nativeImageGenerationEnabled, true);

    const official = edit(responses, { type: "setMode", mode: "official" });
    assert.equal(official.preview.profile.nativeImageGenerationEnabled, false);
  });

  it("serializes the native image generation intent without moving the API key into config", () => {
    const source = profile();
    const edited = edit(openExisting(source, context([source])), {
      type: "patch",
      patch: {
        nativeImageGenerationEnabled: true,
        apiKey: "sk-native-image-secret",
      },
    });
    const result = commit(edited);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.profile.nativeImageGenerationEnabled, true);
    assert.doesNotMatch(result.profile.configContents, /sk-native-image-secret/);
    assert.match(result.profile.authContents, /sk-native-image-secret/);
  });

  it("renders the experimental native image switch with explicit compatibility constraints", () => {
    const editor = readFileSync(
      new URL("./components/RelayProfileEditor.tsx", import.meta.url),
      "utf8",
    );
    const english = readFileSync(new URL("../../i18n/english.ts", import.meta.url), "utf8");

    assert.match(editor, /启用 Codex 原生图片生成/);
    assert.match(editor, /profile\.protocol !== "responses" \|\| profile\.relayMode !== "pureApi"/);
    assert.match(editor, /\/v1\/images\/generations/);
    assert.match(editor, /data\[\]\.b64_json/);
    assert.match(editor, /仅在 \/v1\/models 中出现 gpt-image-2 不能证明兼容/);
    assert.match(editor, /当前版本不代理图片生成路径/);
    assert.match(english, /Enable native Codex image generation/);
  });
});
