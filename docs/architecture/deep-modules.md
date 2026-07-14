# Deep-module ownership

This document records the stable interfaces and ownership boundaries created by
the feature-first refactor. `CONTEXT.md` remains the vocabulary reference; this
file owns implementation architecture, invariants, and deletion tests.

The common design rule is that an interface names a user scenario while its
module owns the decisions required to complete that scenario. Adapters translate
between framework or wire types and these interfaces; they do not reimplement
the scenario.

## Relay profile editor

**Interface:** `open / edit / commit` in
`apps/chatgpt-plus-manager/src/features/relay-profiles/editor.ts`.

- `open(request)` hydrates one semantic draft from the request's settings,
  default context, optional live files, and existing-or-create focus.
- `edit(state, intent)` applies a named editor intent. Callers do not patch a
  stored profile directly; duplicate is a collection intent at this stage.
- `commit(state)` validates and emits collection effects; invalid drafts return
  issues without mutating the caller's settings.

**Invariants:** The draft has one canonical model-row representation. Stored
`modelList` and `modelWindows` are projections, not parallel React state.
Normalization covers mode transitions, aggregate membership and weights,
legacy fields, context selection, preset application, and config/auth
projection. The module publishes the repository's single TypeScript
`RelayProfile` definition through its feature types.

**Adapters and locality:** Relay screen components translate UI events to edit
intents and render the immutable preview. Application composition owns React
state and asynchronous Tauri calls, but no editor rules. Stored-file and model
window mechanics remain private to the feature.

**Leverage:** One lifecycle protects create, update, duplicate, delete,
reorder, activation, presets, and aggregate editing. Interface tests exercise
complete `open -> edit -> commit` scenarios rather than private helpers.

**Deletion test:** Removing the editor would force draft normalization,
model-window serialization, config/auth projection, mode transition rules, and
aggregate collection effects back into both screen components and application
callers. That redistribution demonstrates module depth.

## Codex home mutation

**Interface:** `reconcile / activate` in
`crates/chatgpt-plus-core/src/codex_home_apply.rs`.

- `reconcile(home, intent)` makes the selected settings state true in a Codex
  home. Its intent distinguishes applying the active profile from explicitly
  clearing ChatGPT++-managed Relay state.
- `activate(store, home, requested_settings, target_relay_id)` performs the
  settings selection and Codex home mutation as one transaction.

**Invariants:** Callers do not choose per-mode write/clear functions or order
config, auth, catalog, backup, and postcondition steps. Reconciliation preserves
unmanaged Codex state and shared context. Activation validates the target,
persists settings, reconciles the home, checks the resulting status, and rolls
back both raw settings and the original `config.toml`/`auth.json` on failure.
Opening the ChatGPT++ UI does not mutate Codex home. A managed Codex launch
reconciles the already-selected active profile before Provider Sync and spawn;
explicit profile selection still uses the transactional `activate` path.

**Adapters and locality:** Manager Relay commands resolve the configured home
and delegate the scenario to this module. Parsing, status capture, and context
inspection remain independently useful read interfaces in Relay config code;
mutation orchestration does not leak through them.

**Leverage:** A single transaction owns mode selection, managed/unmanaged
boundaries, atomic writes, backups, catalog/auth projection, and rollback for
all manager mutation callers.

**Deletion test:** Removing this seam would make manager commands coordinate
settings persistence, mode-specific live-file writes, postconditions, and two
resource rollbacks again. No long-lived forwarding mutation wrapper is kept.

## Settings facade

**Interface:** `crates/chatgpt-plus-core/src/settings.rs` exports the wire types
that callers need, `SettingsStore`, and `normalize_settings_before_save`.
Implementation is owned by `settings/types.rs`, `settings/store.rs`, and
`settings/migration.rs`.

**Invariants:** Serde field names, defaults, omitted derived fields, and legacy
settings remain compatible. Loading missing or invalid data falls back to the
established defaults. Updates preserve unknown raw-object fields. Normalization
owns legacy Relay/common-context extraction and value clamps. Persistence uses
the shared atomic-file implementation; transactional callers can capture and
restore the exact raw settings bytes.

**Adapters and locality:** Tauri settings commands translate command payloads
to the facade. They do not duplicate normalization. Wire representation lives
with types, compatibility transforms with migration, and filesystem behavior
with store.

**Leverage:** The facade shields all consumers from serialization migration,
unknown-field preservation, normalization, and atomic storage mechanics.

**Deletion test:** Removing it would spread serde compatibility and migration
decisions into manager commands, Relay mutation, managed launch configuration,
and other settings consumers.

## Tauri command domains

**Interface:** Command names and payloads are the compatibility boundary.
`apps/chatgpt-plus-manager/src-tauri/src/commands.rs` declares the modules and
shared result facade; `lib.rs` registers handlers directly.

The adapters are grouped by business domain:

- `settings`: lifecycle, overview, settings, and provider-import entrypoints;
- `relay`: Relay status, files, activation, tests, and diagnostics;
- `context`: managed context inventory and synchronization;
- `diagnostics`: logs and environment conflict repair;
- `install`: entrypoints, updates, and marketplace maintenance;
- `sessions`: local sessions and provider synchronization.

**Invariants:** Every registered name remains the frontend wire command name.
Domain functions are the annotated Tauri handlers; the facade contains no set
of forwarding wrappers. Shared code is limited to result envelopes and truly
cross-domain payloads. Business behavior delegates to core/data modules.

**Adapters, locality, and leverage:** Request types stay beside the handler
that consumes them, so changing one scenario normally touches one domain file.
The registration list remains an explicit compatibility inventory. Removing a
domain adapter would force framework payload/error translation into `lib.rs`,
not move core behavior there.

**Deletion test:** Collapsing the domain modules recreates a multi-domain
command file where unrelated settings, session, install, context, diagnostic,
and Relay changes collide.

## Protocol transaction seam

**Interface:** `ProtocolProxyRequest`, `ProtocolProxyResponse`, and
`protocol_proxy_transaction` in
`crates/chatgpt-plus-core/src/protocol_proxy.rs`; URL construction uses
`local_responses_proxy_base_url`.

**Invariants:** One transaction owns route recognition, request conversion,
tool translation, upstream selection/authentication, timeout and User-Agent
behavior, aggregate failover, buffered response conversion, and streaming SSE
conversion. Internal route/request/response/stream/tools/upstream files are not
re-exported as a helper API. A reusable owned request body survives failover.

**Adapters and locality:** The manager-owned launch runtime owns socket
lifecycle, parses the raw HTTP envelope into `ProtocolProxyRequest`, invokes one
transaction, and writes the returned response. It does not choose conversion
or failover order.

**Leverage:** The same seam handles Responses passthrough, Chat Completions
translation, models/options routes, streaming, and errors while keeping
protocol state out of the manager adapter.

**Deletion test:** Removing the transaction would move routing, conversion,
stream state, upstream policy, retry/failover, and error ordering into the
launch runtime. That concentration of recovered complexity demonstrates the
seam's depth.

## Zed compatibility boundary

The **Manager Zed Remote** and upstream-worktree product surfaces, core
adapters, settings, and Bridge routes have been removed end to end. Serde
continues to ignore unknown fields in old settings JSON, but removed fields are
never serialized back into current settings.

## Repository dependency contract

The manager declares `pnpm@10.33.0` in `package.json`. `pnpm-lock.yaml` is the
only JavaScript dependency lockfile and CI installs with
`pnpm install --frozen-lockfile`. The Rust workspace continues to use
`Cargo.lock`. Generated dependency/build directories are ignored and are not
source artifacts.
