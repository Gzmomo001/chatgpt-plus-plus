# ChatGPTPlusPlus Deep Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Every production change follows RED -> GREEN -> REFACTOR. Complete spec compliance review before code quality review.

**Goal:** Preserve all externally observable behavior while restructuring ChatGPTPlusPlus around feature-first, deep modules with small scenario-level interfaces.

**Architecture:** The Relay profile feature owns its semantic editor lifecycle behind `open`, `edit`, and `commit`. Codex home mutation is owned by `reconcile` and `activate`; Tauri commands and the launcher remain adapters. Rust facades keep external interfaces small while private files concentrate settings and protocol-proxy implementation by domain responsibility.

**Tech Stack:** React 19, TypeScript, Node's test runner, pnpm, Rust, Cargo, Tauri 2.

---

## Baseline and invariants

- Baseline commit: `136025f6e53e16ed77e5fa53b6c2fc2fbfa1961c` on `feature/deepen-relay-architecture`.
- The worktree was clean before this plan was written. The repository was not unborn, so no replacement baseline commit or branch was needed.
- Generated directories are ignored and untracked: `node_modules`, `dist`, `target`, `.pnpm-store`, and `__pycache__`.
- No tracked `auth.json`, `.env`, user `config.toml`, or generated directory was found. `.cargo/config.toml` is a tracked build configuration, not a user Codex config.
- Both lockfiles are currently tracked. `package.json` declares `pnpm@10.33.0`; `package-lock.json` has no independent script or CI role and is removed only in the final hygiene slice.
- Baseline evidence:
  - `cargo fmt --all -- --check`: pass.
  - `cargo check --workspace`: pass with 12 existing warnings.
  - `node --test src/relay-profile-editor.test.ts`: 16 pass.
  - `pnpm check`: pass.
  - `pnpm vite:build`: pass.
  - `cargo test --workspace`: all suites before manager pass; manager has three sandbox-only failures because tests write backups below the real home.
  - `HOME=/tmp/chatgpt-plus-plus-test-home CARGO_HOME=/Users/zhangzimo/.cargo RUSTUP_HOME=/Users/zhangzimo/.rustup cargo test -p chatgpt-plus-manager --lib`: 33 pass.
- Launcher invariant: launch never calls `codex_home_apply::reconcile` or `activate`; no launch-time automatic relay apply is added.
- Compatibility invariants: Tauri command names, serde names and omissions, settings unknown-field behavior, backup/atomic-write behavior, Codex user context, official login tokens, marketplaces, and legacy settings migration remain unchanged.

## Target ownership map

```text
apps/chatgpt-plus-manager/src/
  app/App.tsx                       application composition only
  app/actions.ts                   typed Tauri adapter calls
  screens/{overview,relay-profiles,context,diagnostics,settings}/
  features/relay-profiles/
    editor.ts                      open/edit/commit deep module
    editor.test.ts                 interface-only lifecycle tests
    types.ts                       one RelayProfile wire type and editor intents
    config-projection.ts           private stored-file implementation
    model-windows.ts               private model-row implementation
    validation.ts                  private lifecycle invariants
    components/                    feature UI adapters
  shared/{ui,lib}/
  i18n/

apps/chatgpt-plus-manager/src-tauri/src/
  commands.rs                      facade and declarations
  commands/{shared,relay,settings,context,diagnostics,install,sessions}.rs
  lib.rs                           stable command registration

crates/chatgpt-plus-core/src/
  codex_home.rs                    unique home resolver facade
  codex_home_apply.rs              reconcile/activate external seam
  codex_home/{apply,status,context,projection,auth,files}.rs
  settings.rs                      compatibility facade
  settings/{types,store,migration}.rs
  protocol_proxy.rs                transaction-level facade
  protocol_proxy/{routes,request,response,stream,tools,upstream}.rs
  atomic_file.rs                   shared atomic filesystem implementation
```

The exact private file split may be reduced when a proposed file would expose only a shallow helper. The required external seams do not change.

### Task 1: Establish executable characterization gates

**Files:**
- Modify: `apps/chatgpt-plus-manager/package.json`
- Move later, not in this task: `apps/chatgpt-plus-manager/src/relay-profile-editor.test.ts`
- Test: existing manager and core suites

- [ ] **Step 1: RED — prove the declared frontend test gate is missing**

  Run `pnpm test` in `apps/chatgpt-plus-manager` and record the expected failure that no `test` script exists.

- [ ] **Step 2: GREEN — add a dependency-free test script**

  Add `"test": "node --test src/relay-profile-editor.test.ts"` to `scripts`. Do not add `tsx`, Vitest, or any dependency.

- [ ] **Step 3: Verify all baseline gates**

  Run `pnpm test`, `pnpm check`, and `pnpm vite:build`. Run the isolated-HOME manager test command above. Confirm `git status --short` contains only the intentional package and plan changes plus ignored build output.

- [ ] **Step 4: Commit the characterization gate**

  Commit only `package.json` and this plan after review.

### Task 2: Deepen the Relay profile editor with a preset tracer bullet

**Files:**
- Create: `apps/chatgpt-plus-manager/src/features/relay-profiles/types.ts`
- Create: `apps/chatgpt-plus-manager/src/features/relay-profiles/editor.ts`
- Create: `apps/chatgpt-plus-manager/src/features/relay-profiles/editor.test.ts`
- Create: `apps/chatgpt-plus-manager/src/features/relay-profiles/components/ProviderPresetSelector.tsx`
- Modify: `apps/chatgpt-plus-manager/package.json`
- Modify: `apps/chatgpt-plus-manager/src/App.tsx`
- Delete after callers migrate: old root editor/test and old selector

- [ ] **Step 1: RED — characterize the real preset seam**

  Add an interface test that obtains the preset intent through the selector's exported mapping, passes it to `edit`, then `commit`, and asserts both model rows and model-window values survive. The test must fail because the current App adapter discards `modelList` and `modelWindows`.

- [ ] **Step 2: GREEN — define the narrow lifecycle**

  Export only the scenario operations `open(profile, context)`, `edit(state, intent)`, and `commit(state)`. Represent preset selection as an intent such as `{ type: "applyPreset"; presetId: string }`; do not expose `Partial<RelayProfile>` from the selector.

- [ ] **Step 3: Migrate the preset caller**

  Make the selector emit the intent directly. Remove the App implementation that strips stored model fields. In the same change that moves `relay-profile-editor.test.ts` to `features/relay-profiles/editor.test.ts`, update the `package.json` test script to `node --test src/features/relay-profiles/editor.test.ts`; immediately run `pnpm test` so the gate cannot silently point at a deleted path. Then run `pnpm check` and `pnpm vite:build`.

- [ ] **Step 4: Review and commit**

  Apply the deletion test: without the editor module, preset/model projection must return to both App and selector. Complete spec review, then code-quality review, then commit.

### Task 3: Move all Relay lifecycle and projection implementation behind open/edit/commit

**Files:**
- Modify: feature editor/types/tests
- Create only if private depth warrants it: `config-projection.ts`, `model-windows.ts`, `validation.ts`
- Create/move: `features/relay-profiles/components/{RelayProfileEditor,AggregateRelayProfileEditor}.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: RED — add interface tests one behavior at a time**

  Through `open -> edit -> commit`, cover create, update, duplicate, remove, reorder, activate, mode transitions, live-file policy, aggregate candidate filtering/toggle/weight/strategy, legacy projection, official auth preservation, model rows, context limits, invalid commit, and backend hydration. Observe every test fail for the expected missing intent or invariant before implementation.

- [ ] **Step 2: GREEN — consolidate the semantic draft**

  Keep one canonical `models: ModelWindowRow[]`; never store parallel `modelList` and `modelWindows` in React state. Remove duplicated `profiles` versus `settings.relayProfiles`, duplicate `isNew`, and draft-to-profile projection in callers.

- [ ] **Step 3: Remove App implementation**

  Delete the duplicate normalization/TOML/auth/model-window/aggregate/lifecycle functions identified by the completion `rg` audit. Presenter-only labels may remain in the feature UI; business decisions do not.

- [ ] **Step 4: Replace shallow tests**

  Delete source-string helper assertions once equivalent observable behavior is tested across `open/edit/commit`. Keep only a final negative source audit outside the behavior suite.

- [ ] **Step 5: Verify, review, and commit**

  Run frontend tests/check/build and manager Rust tests. Complete spec review followed by quality review. Confirm the editor interface, not helpers, is the test surface.

### Task 4: Extract feature-first React composition

**Files:**
- Create: `src/app/App.tsx`, `src/app/actions.ts`
- Create/move: `src/screens/{overview,relay-profiles,context,diagnostics,settings}/**`
- Move: `src/components/ui/**` to `src/shared/ui/**`
- Move: `src/lib/**` to `src/shared/lib/**`
- Move: i18n files under `src/i18n/`
- Modify: `src/main.tsx`, imports, source-shape tests
- Delete: old root `src/App.tsx` only after all screen callers migrate

- [ ] **Step 1: RED — lock application behavior and command strings**

  Add/adjust characterization tests that compare visible route ids and the frontend Tauri command-name set before and after extraction. These tests must initially fail against the target import paths.

- [ ] **Step 2: GREEN — migrate one screen at a time**

  Move `relay-profiles` first, then overview, context, diagnostics, and settings. Each screen is a feature-level UI adapter; `app/App.tsx` only composes routes, global React state, and actions.

- [ ] **Step 3: Verify each vertical slice**

  After every screen, run `pnpm test` and `pnpm check`; after all screens, run `pnpm vite:build` and manager tests. Do not perform a one-shot whole-tree move.

- [ ] **Step 4: Review and commit**

  Confirm no duplicate `RelayProfile` TypeScript type exists and files that change together now have locality.

### Task 5: Make Codex home activation transactional and remove the shallow switch adapter

**Files:**
- Modify: `crates/chatgpt-plus-core/src/codex_home_apply.rs`
- Modify: `crates/chatgpt-plus-core/tests/codex_home_apply.rs`
- Modify: `crates/chatgpt-plus-core/src/lib.rs`
- Delete: `crates/chatgpt-plus-core/src/relay_switch.rs`
- Delete: `crates/chatgpt-plus-core/tests/relay_switch.rs`

- [ ] **Step 1: RED — prove settings and home both roll back**

  Extend the existing postcondition-failure test to seed prior `config.toml` and `auth.json`, force reconciliation to write then fail, and assert both files plus persisted settings are restored. Confirm the current implementation fails on home contents.

- [ ] **Step 2: GREEN — restore the whole activation transaction**

  Snapshot home before mutation and restore it on any reconciliation/postcondition failure while retaining the original error. Keep backup and atomic-write details behind `activate`.

- [ ] **Step 3: Replace the shallow adapter tests**

  Move the four `relay_switch` behaviors to direct `activate` tests, then remove the zero-production-caller module and export. Do not leave forwarding wrappers.

- [ ] **Step 4: Verify, review, and commit**

  Run `cargo test -p chatgpt-plus-core --test codex_home_apply`, core tests, manager tests, and launcher tests. Reconfirm launcher performs no activation.

### Task 6: Collapse all Codex home callers onto reconcile/activate

**Files:**
- Modify: `codex_home_apply.rs`, `relay_config.rs`, `relay_config/tests.rs`
- Modify: manager `commands/relay.rs` after Task 8 or current `commands.rs` before it
- Modify: core tests and `lib.rs`

- [ ] **Step 1: RED — migrate behavior tests to the scenario seam**

  Add reconcile tests for Official clear, Pure API, mixed, aggregate, common/context merge, unmanaged preservation, invalid TOML/auth atomicity, guard, catalog, auth preservation, and postconditions. Each replaces, rather than layers over, a legacy mutation test.

- [ ] **Step 2: GREEN — hide mode and write orchestration**

  Make manager apply/switch/clear adapters call only `reconcile` or `activate`. Replace the synthetic Official-clear profile assembled in the caller with settings-driven behavior behind the seam.

- [ ] **Step 3: Narrow relay_config**

  Make superseded apply/clear/PureApi mutation functions private or delete them. Keep parser, context, capture/status, and other independently valuable interfaces.

- [ ] **Step 4: Remove duplicated tests and interfaces**

  Delete replaced mutation tests, unused `CodexHomeDisposition::Unchanged`, and public `RelayApplyResult` if no real caller remains. Consolidate the default Codex home resolver instead of keeping pass-through copies.

- [ ] **Step 5: Verify, review, and commit**

  Run core, manager, and launcher gates plus the completion `rg` audit.

### Task 7: Split settings by ownership without changing its wire format

**Files:**
- Keep facade: `crates/chatgpt-plus-core/src/settings.rs`
- Create: `settings/types.rs`, `settings/migration.rs`, `settings/store.rs`
- Create: `atomic_file.rs`
- Modify: callers of atomic write and settings normalization
- Add: settings store/migration interface tests

- [ ] **Step 1: RED — freeze serialization and migration goldens**

  Add golden tests for camelCase names, skipped derived fields, defaults, unknown-field preservation, invalid/missing JSON, legacy single relay, legacy chat upstream, official/mixed auth, model suffix windows, common/context extraction, and image/stepwise clamps.

- [ ] **Step 2: GREEN — move types only**

  Move wire types/defaults while preserving the `settings` facade's necessary re-exports. Run the settings and workspace checks.

- [ ] **Step 3: GREEN — move migration implementation**

  Centralize `normalize_settings_before_save` behavior and remove the manager copy. Break the current settings/relay_config knowledge cycle with one private profile codec/migration implementation, not another public helper seam.

- [ ] **Step 4: GREEN — move store and atomic file implementation**

  Move `SettingsStore` and raw-object merge behavior into `store.rs`. Move reusable atomic filesystem writing to `atomic_file.rs`; do not make unrelated modules depend on settings implementation.

- [ ] **Step 5: Verify, review, and commit**

  Run settings tests, core tests, isolated-HOME manager tests, format, and check. Diff serialized golden files before approval.

### Task 8: Split Tauri commands by business domain

**Files:**
- Keep facade: `apps/chatgpt-plus-manager/src-tauri/src/commands.rs`
- Create: `commands/{shared,sessions,install,context,diagnostics,settings,relay}.rs`
- Modify: `src-tauri/src/lib.rs`
- Preserve: root `src-tauri/src/install.rs` as platform install adapter

- [ ] **Step 1: RED — lock the 64-command compatibility interface**

  Add a test that compares annotated command names, `generate_handler!` registrations, and frontend command strings, accounting for the three tray commands in `lib.rs` and dynamic launch/restart strings.

- [ ] **Step 2: GREEN — extract in low-coupling order**

  Move sessions, install, context, diagnostics, settings, then relay. Keep request/payload types beside their command implementation; put only `CommandResult`, `ok`, `failed`, and truly cross-domain result types in shared.

- [ ] **Step 3: Update registration paths without wrappers**

  Preserve every function name and `#[tauri::command]`. Update `generate_handler!` paths and source-contract tests. Never introduce 64 forwarding functions.

- [ ] **Step 4: Verify each module**

  Run manager lib tests after every extraction, then `cargo test -p chatgpt-plus-manager`, `cargo check --workspace`, frontend tests/check/build, and command inventory audits.

- [ ] **Step 5: Review and commit**

  Confirm command modules are adapters delegating core behavior and `commands.rs` is no longer a multi-domain implementation file.

### Task 9: Deepen protocol_proxy behind a transaction-level interface

**Files:**
- Keep facade: `crates/chatgpt-plus-core/src/protocol_proxy.rs`
- Create: `protocol_proxy/{routes,request,response,stream,tools,upstream}.rs`
- Modify: `launcher.rs`
- Modify/split: `tests/protocol_proxy.rs`, `tests/launcher.rs`

- [ ] **Step 1: RED — characterize the transaction interface**

  Add raw HTTP/helper tests for Responses passthrough, Chat conversion, SSE conversion, aliases, `OPTIONS /models`, content type/status, partial UTF-8, upstream midstream failure, configured/original User-Agent, timeout, aggregate failover, and reusable request bodies.

- [ ] **Step 2: GREEN — move routes and conversions privately**

  Move path/URL normalization, request conversion, tool translation, non-stream response conversion, and stream state without expanding visibility. Existing conversion tests continue to exercise observable results through the transaction interface where possible.

- [ ] **Step 3: GREEN — internalize upstream orchestration**

  Put relay selection, failover, rotation bookkeeping, auth, timeout, User-Agent, and upstream errors behind the protocol transaction. Launcher owns socket lifecycle and writes returned HTTP/stream outcomes; it does not choose conversion order.

- [ ] **Step 4: Narrow the facade and replace shallow tests**

  Remove test-only public helpers and avoid re-exporting every conversion function. Keep only routing/configuration and transaction-level types/functions callers truly require.

- [ ] **Step 5: Verify, review, and commit**

  Run protocol proxy, launcher, cdp bridge, core, and workspace suites. Apply the deletion test: removing protocol_proxy must force conversion/stream/error/failover complexity back into launcher.

### Task 10: Repository hygiene and architecture documentation

**Files:**
- Delete: `apps/chatgpt-plus-manager/package-lock.json`
- Keep: `pnpm-lock.yaml`
- Create/update: `docs/architecture/deep-modules.md`
- Review only: `.gitignore`, `CONTEXT.md`, manifests

- [ ] **Step 1: Prove package-lock has no independent role**

  Search scripts, workflows, docs, and manifests for npm/package-lock usage. Confirm pnpm installation/build is reproducible from `pnpm-lock.yaml`, then delete `package-lock.json`.

- [ ] **Step 2: Document module ownership**

  Record the Relay editor and Codex home interfaces, their invariants, adapters, locality, leverage, and deletion tests. Keep `CONTEXT.md` limited to domain language.

- [ ] **Step 3: Audit manifests and generated files**

  Confirm Cargo/package manifest changes were necessary and minimal. Verify no generated directory, secret, temporary placeholder, or unknown file is tracked.

- [ ] **Step 4: Review and commit**

  Run `git diff --check`, inspect rename/diff statistics, and complete hygiene review.

### Task 11: Full completion audit and branch handoff

- [ ] Run `cargo fmt --all -- --check`.
- [ ] Run `cargo check --workspace`.
- [ ] Run `cargo test -p chatgpt-plus-core`.
- [ ] Run isolated-HOME `cargo test -p chatgpt-plus-manager` if sandboxed; also attempt the exact command and record any sandbox-only failure.
- [ ] Run isolated-HOME `cargo test --workspace` if sandboxed; preserve the exact current evidence.
- [ ] Run `pnpm check`, `pnpm vite:build`, and `pnpm test` in the manager directory.
- [ ] Run `git diff --check`.
- [ ] Run all App/editor, relay_config, command inventory, protocol facade, launcher no-apply, duplicate type, lockfile, and generated-file `rg` audits from the task reviews.
- [ ] Inspect `git status --short --branch` and `git diff --stat`; verify no accidental deletions or unrelated changes.
- [ ] Perform a requirement-by-requirement completion audit against the original pasted specification. Record every skipped, failed, or environment-blocked command; narrower tests never substitute for a required full gate.
- [ ] Dispatch final spec review, then final code-quality review. Fix and re-review all findings.
- [ ] Use `finishing-a-development-branch` and present integration options only after every requirement has current evidence.

## Completion audits

Key zero-result searches include:

```sh
rg -n 'generatedProfileLocal|buildRelay(ConfigToml|AuthJson)|canonicalStoredProfileLocal|projectLegacySettingsLocal|canonicalAggregate(Profile|Config)Local|parseModelSuffix' apps/chatgpt-plus-manager/src/app/App.tsx
rg -n 'Partial<RelayProfile>|modelList: _modelList|modelWindows: _modelWindows|as BackendSettings' apps/chatgpt-plus-manager/src
rg -n 'relay_switch|switch_relay_profile_in_home|RelaySwitchResult|previous_active_relay_id' crates apps
rg -n 'pub(\(crate\))? fn (apply_relay|apply_pure_api|clear_relay)' crates/chatgpt-plus-core/src/relay_config.rs
rg -n 'apply_active_relay_profile|codex_home_apply::(reconcile|activate)' crates/chatgpt-plus-core/src/launcher.rs
rg -n 'normalize_settings_before_save|crate::settings::atomic_write' crates apps
rg -n 'include_str!\("commands\.rs"\)|commands::apply_pure_api_injection' apps crates/chatgpt-plus-core/tests
rg -n '^pub ' crates/chatgpt-plus-core/src/protocol_proxy.rs crates/chatgpt-plus-core/src/protocol_proxy
git ls-files | rg '(^|/)(node_modules|dist|target|\.pnpm-store|__pycache__)(/|$)|(^|/)(auth\.json|\.env($|\.))'
```

Expected structural checks:

- Exactly one TypeScript `RelayProfile` wire type.
- Exactly one lockfile for the manager: `pnpm-lock.yaml`.
- Exactly 64 compatible manager command names unless a separately justified external deprecation is approved; this plan authorizes no command-name deletion.
- Relay editor behavior tests cross only `open`, `edit`, and `commit`.
- Codex home mutation callers cross only `reconcile` and `activate`.
- No long-term forwarding wrapper survives solely to keep old tests green.
- The Relay editor and Codex home modules both pass the deletion test.
