use chatgpt_plus_core::assets;
use serde_json::json;
use std::io::Write;
use std::process::Command;

fn run_runtime_harness(source: &str) {
    let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(std::path::Path::parent)
        .expect("core crate should live under crates/chatgpt-plus-core");
    let script_path = repo.join("assets/inject/runtime-compat.js");
    let temp = tempfile::tempdir().expect("temp dir should be created");
    let harness_path = temp.path().join("runtime-compat-harness.cjs");
    let script_path_json =
        serde_json::to_string(&script_path).expect("script path should serialize as JSON");
    std::fs::write(
        &harness_path,
        source.replace("__SCRIPT_PATH__", &script_path_json),
    )
    .expect("harness should be written");

    let output = Command::new("node")
        .arg(&harness_path)
        .output()
        .expect("node should run runtime compatibility harness");
    assert!(
        output.status.success(),
        "node harness failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn runtime_browser_global_is_versioned_complete_and_commonjs_safe() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const scriptPath = __SCRIPT_PATH__;
delete globalThis.__chatgptPlusRuntimeCompatibility;
delete globalThis.ChatGPTPlusRuntimeCompat;
const commonJsExport = require(scriptPath);
assert.equal(
  globalThis.__chatgptPlusRuntimeCompatibility,
  undefined,
  "standalone CommonJS loading must not mutate the Node global",
);
assert.equal(typeof commonJsExport.createRuntimeCompatibility, "function");
assert.ok(commonJsExport.apiVersion);

const source = fs.readFileSync(scriptPath, "utf8");
const context = { console, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);
const first = context.__chatgptPlusRuntimeCompatibility;
const requiredMethods = [
  "normalizeRequest", "replaceRequestParams", "detectCapabilities",
  "installRequestInterceptor", "observeSessions", "resolveCurrentThread",
];
assert.ok(first);
assert.equal(first.apiVersion, context.ChatGPTPlusRuntimeCompat.apiVersion);
for (const method of requiredMethods) assert.equal(typeof first[method], "function", method);
assert.equal(typeof first.dom, "object");

vm.runInContext(source, context);
assert.equal(context.__chatgptPlusRuntimeCompatibility, first, "compatible instance is reused");

const brand = Symbol.for("chatgpt-plus.runtime-compat.instance");
for (const impostor of [
  { detectCapabilities() {}, installRequestInterceptor() {}, normalizeRequest() {} },
  { ...first, [brand]: "old-version", apiVersion: "old-version" },
  { [brand]: first.apiVersion, apiVersion: first.apiVersion, normalizeRequest() {} },
]) {
  context.__chatgptPlusRuntimeCompatibility = impostor;
  vm.runInContext(source, context);
  const replacement = context.__chatgptPlusRuntimeCompatibility;
  assert.notEqual(replacement, impostor, "incomplete or incompatible instance is replaced");
  assert.equal(replacement.apiVersion, context.ChatGPTPlusRuntimeCompat.apiVersion);
  for (const method of requiredMethods) assert.equal(typeof replacement[method], "function", method);
  assert.equal(typeof replacement.dom, "object");
}

(async () => {
  const dispatcher = vm.runInContext(
    '({ dispatchMessage(type, payload) { return { type, payload }; } })',
    context,
  );
  const configured = context.ChatGPTPlusRuntimeCompat.createRuntimeCompatibility({
    root: context,
    loadModule: async () => ({ dispatcher }),
  });
  await configured.installRequestInterceptor("before-replacement", () => null);
  const installedWrapper = dispatcher.dispatchMessage;
  const sharedState = context[Symbol.for("chatgpt-plus.runtime-compat.state.v1")];
  delete sharedState.domFeatureStatus;
  sharedState.domSchemaVersion = 1;
  sharedState.domQueryFeatures = new Map([["composer", { disabled: true, failures: 99 }]]);
  delete sharedState.domObservers;
  delete sharedState.domPolls;
  delete sharedState.MutationObserver;
  context.__chatgptPlusRuntimeCompatibility = {
    [brand]: "old-version",
    apiVersion: "old-version",
  };
  vm.runInContext(source, context);
  await context.__chatgptPlusRuntimeCompatibility.installRequestInterceptor(
    "after-replacement",
    () => null,
  );
  assert.equal(
    dispatcher.dispatchMessage,
    installedWrapper,
    "replacement instance shares root state and never nests the transport wrapper",
  );
  assert.doesNotThrow(
    () => context.__chatgptPlusRuntimeCompatibility.dom.status(),
    "legacy shared root state is hydrated for the new DOM adapter",
  );
  assert.equal(sharedState.domSchemaVersion, 2);
  assert.equal(sharedState.domQueryFeatures.size, 0, "old breaker state is cleared on schema upgrade");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
"#,
    );
}

#[test]
fn browser_bootstrap_defaults_accept_first_explicit_probe_configuration() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(__SCRIPT_PATH__, "utf8");

function browserContext() {
  const context = { console, setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

(async () => {
  const timeoutContext = browserContext();
  let attempts = 0;
  const timeoutSlices = [];
  const timer = {
    setTimeout(callback, milliseconds) {
      timeoutSlices.push(milliseconds);
      return setTimeout(callback, 0);
    },
    clearTimeout,
  };
  const firstConfigured = timeoutContext.ChatGPTPlusRuntimeCompat.createRuntimeCompatibility({
    root: timeoutContext,
    maxAttempts: 2,
    timeoutMs: 20,
    timer,
    loadModule() { attempts += 1; return new Promise(() => {}); },
  });
  timeoutContext.ChatGPTPlusRuntimeCompat.createRuntimeCompatibility({
    root: timeoutContext,
    maxAttempts: 5,
    timeoutMs: 100,
  });
  await firstConfigured.detectCapabilities();
  assert.equal(attempts, 2, "first explicit maxAttempts supplements bootstrap defaults");
  assert.deepStrictEqual(timeoutSlices, [10, 10], "first explicit timeout remains authoritative");

  const budgetContext = browserContext();
  const diagnostics = [];
  const graph = { one: { two: { three: {} } } };
  const budgetRuntime = budgetContext.ChatGPTPlusRuntimeCompat.createRuntimeCompatibility({
    root: budgetContext,
    maxAttempts: 1,
    probeMaxDepth: 2,
    probeMaxKeys: 3,
    probeMaxNodes: 4,
    loadModule: async () => graph,
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  });
  budgetContext.ChatGPTPlusRuntimeCompat.createRuntimeCompatibility({
    root: budgetContext,
    probeMaxDepth: 9,
    probeMaxKeys: 99,
    probeMaxNodes: 99,
  });
  await budgetRuntime.detectCapabilities();
  const budgetDiagnostic = diagnostics.find(([code]) => code === "runtime_bundle_probe_budget_exhausted");
  assert.equal(JSON.stringify(budgetDiagnostic?.[1]), JSON.stringify({
    maxDepth: 2, maxKeys: 3, maxNodes: 4,
  }));

  const breakerContext = browserContext();
  const dispatcher = { dispatchMessage(type, payload) { return { type, payload }; } };
  const breakerRuntime = breakerContext.ChatGPTPlusRuntimeCompat.createRuntimeCompatibility({
    root: breakerContext,
    failureThreshold: 1,
    loadModule: async () => ({ dispatcher }),
  });
  breakerContext.ChatGPTPlusRuntimeCompat.createRuntimeCompatibility({
    root: breakerContext,
    failureThreshold: 5,
  });
  let handlerCalls = 0;
  await breakerRuntime.installRequestInterceptor("first-writer", () => {
    handlerCalls += 1;
    throw new Error("expected failure");
  });
  const request = vm.runInContext(
    '({ request: { method: "thread/start", params: {} } })',
    breakerContext,
  );
  dispatcher.dispatchMessage("mcp-request", request);
  dispatcher.dispatchMessage("mcp-request", request);
  assert.equal(handlerCalls, 1, "first explicit failure threshold remains authoritative");
})();
"#,
    );
}

#[test]
fn final_injection_artifact_installs_runtime_before_renderer_bootstrap() {
    let artifact = assets::injection_script(57321);
    let helper_index = artifact
        .find("window.__CODEX_SESSION_DELETE_HELPER__")
        .expect("host configuration should lead the artifact");
    let runtime_index = artifact
        .find("root.__chatgptPlusRuntimeCompatibility")
        .expect("runtime compatibility instance should be embedded");
    let renderer_index = artifact
        .find("function installChatGPTPlusFastStartup")
        .expect("renderer bootstrap should remain embedded");
    let stepwise_index = artifact
        .find("const API_KEY = \"__codexStepwisePanel\"")
        .expect("stepwise bootstrap should remain embedded");
    assert!(helper_index < runtime_index);
    assert!(runtime_index < renderer_index);
    assert!(renderer_index < stepwise_index);

    let renderer_source = assets::renderer_script();
    let renderer_guard = r#"if (!window.__chatgptPlusRuntimeCompatibility ||
  typeof window.__chatgptPlusRuntimeCompatibility.detectCapabilities !== "function" ||
  typeof window.__chatgptPlusRuntimeCompatibility.installRequestInterceptor !== "function" ||
  typeof window.__chatgptPlusRuntimeCompatibility.normalizeRequest !== "function") {
  throw new Error("runtime compatibility missing before renderer bootstrap");
}
window.__chatgptPlusRuntimeObservedBeforeRenderer = true;
"#;
    let instrumented_renderer = format!("{renderer_guard}{renderer_source}");
    let artifact = artifact.replacen(renderer_source, &instrumented_renderer, 1);

    let temp = tempfile::tempdir().expect("temp dir should be created");
    let artifact_path = temp.path().join("chatgpt-plus-injection.cjs");
    let runtime_path = temp.path().join("runtime-compat.cjs");
    let harness_path = temp.path().join("runtime-artifact-harness.cjs");
    std::fs::write(&artifact_path, artifact).expect("artifact should be written");
    std::fs::write(&runtime_path, assets::runtime_compat_script())
        .expect("runtime module should be written");
    let artifact_path_json =
        serde_json::to_string(&artifact_path).expect("artifact path should serialize");
    let runtime_path_json =
        serde_json::to_string(&runtime_path).expect("runtime path should serialize");
    let mut harness = std::fs::File::create(&harness_path).expect("harness should be created");
    write!(
        harness,
        r#"
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const artifactPath = {artifact_path_json};
const runtimePath = {runtime_path_json};
function node() {{
  return {{
    appendChild() {{}}, prepend() {{}}, remove() {{}}, setAttribute() {{}},
    removeAttribute() {{}}, addEventListener() {{}}, querySelector() {{ return null; }},
    querySelectorAll() {{ return []; }}, closest() {{ return null; }},
    classList: {{ add() {{}}, remove() {{}}, toggle() {{}}, contains() {{ return false; }} }},
    dataset: {{}}, style: {{}}, children: [], isConnected: true, textContent: "", innerHTML: "",
  }};
}}
const sandbox = {{ console, URL, AbortController }};
sandbox.window = sandbox;
sandbox.__CHATGPT_PLUS_TEST_SERVICE_TIER__ = true;
sandbox.document = {{
  scripts: [], documentElement: node(), body: node(), createElement: () => node(),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {{}}, removeEventListener() {{}},
}};
sandbox.localStorage = {{ getItem: () => null, setItem() {{}}, removeItem() {{}} }};
sandbox.location = {{ href: "https://codex.test/", pathname: "/", search: "", hash: "" }};
sandbox.navigator = {{ userAgent: "node-test" }};
sandbox.performance = {{ getEntriesByType: () => [] }};
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;
const nativeSetInterval = setInterval;
sandbox.setInterval = (...args) => {{
  const timer = nativeSetInterval(...args);
  timer.unref();
  return timer;
}};
sandbox.clearInterval = clearInterval;
vm.createContext(sandbox);

const guard = setTimeout(() => {{
  console.error("artifact harness exceeded 5 second guard");
  process.exit(1);
}}, 5000);
vm.runInContext(fs.readFileSync(artifactPath, "utf8"), sandbox, {{ timeout: 4000 }});
const runtime = sandbox.__chatgptPlusRuntimeCompatibility;
assert.ok(runtime, "artifact creates the stable browser runtime instance");
assert.equal(typeof runtime.detectCapabilities, "function");
assert.equal(typeof runtime.installRequestInterceptor, "function");
assert.equal(typeof runtime.normalizeRequest, "function");
assert.equal(sandbox.__chatgptPlusRuntimeObservedBeforeRenderer, true);
assert.ok(sandbox.__chatgptPlusServiceTierTest, "renderer executed after runtime bootstrap");

const firstRuntime = runtime;
vm.runInContext(fs.readFileSync(runtimePath, "utf8"), sandbox);
assert.equal(
  sandbox.__chatgptPlusRuntimeCompatibility,
  firstRuntime,
  "duplicate runtime execution reuses the stable runtime instance",
);
clearTimeout(guard);
process.exit(0);
"#,
    )
    .expect("harness should be written");
    drop(harness);

    let output = Command::new("node")
        .arg(&harness_path)
        .output()
        .expect("node should execute the final injection artifact");
    assert!(
        output.status.success(),
        "node artifact harness failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn runtime_capabilities_select_proven_adapters_and_fail_closed() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const scriptPath = __SCRIPT_PATH__;
const { createRuntimeCompatibility } = require(scriptPath);

function dispatcherFixture() {
  return {
    calls: [],
    dispatchMessage(type, payload) {
      this.calls.push([type, payload]);
      return `sent:${type}`;
    },
  };
}

(async () => {
  const staticDispatcher = dispatcherFixture();
  class ExistingModuleShape {
    static getInstance() { return staticDispatcher; }
  }
  const staticRuntime = createRuntimeCompatibility({
    root: { dispatchEvent() { throw new Error("bundle must be preferred"); } },
    loadModule: async (hint) => {
      assert.equal(hint, "setting-storage-");
      return { v: ExistingModuleShape };
    },
  });
  assert.deepStrictEqual(await staticRuntime.detectCapabilities(), {
    status: "supported",
    requestInterceptor: { status: "supported", adapter: "bundle-dispatcher" },
    sessionObservation: { status: "unsupported" },
    currentThreadResolution: { status: "unsupported" },
    dom: { status: "unsupported" },
  });

  const nestedDispatcher = dispatcherFixture();
  const nestedRuntime = createRuntimeCompatibility({
    root: {},
    loadModule: async () => ({ exports: { host: { dispatcher: nestedDispatcher } } }),
  });
  assert.equal(
    (await nestedRuntime.detectCapabilities()).requestInterceptor.adapter,
    "bundle-dispatcher",
    "a nested direct dispatcher object is a second supported export strategy",
  );

  const invalidBundleRoot = { dispatchEvent() { return "event-result"; } };
  const invalidBundleRuntime = createRuntimeCompatibility({
    root: invalidBundleRoot,
    loadModule: async () => ({ v: class MissingDispatch { static getInstance() { return {}; } } }),
  });
  assert.deepStrictEqual((await invalidBundleRuntime.detectCapabilities()).requestInterceptor, {
    status: "degraded",
    adapter: "window-event",
  });

  const diagnostics = [];
  let unknownAttempts = 0;
  const unknownRuntime = createRuntimeCompatibility({
    root: {},
    maxAttempts: 2,
    loadModule: async () => {
      unknownAttempts += 1;
      return { exports: { almost: true } };
    },
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  });
  const unknown = await unknownRuntime.detectCapabilities();
  assert.equal(unknown.status, "unsupported");
  assert.deepStrictEqual(unknown.requestInterceptor, { status: "unsupported", adapter: null });
  await unknownRuntime.detectCapabilities();
  assert.deepStrictEqual(
    await unknownRuntime.installRequestInterceptor("late-feature", () => undefined),
    { status: "unsupported", installed: false, adapter: null },
  );
  assert.equal(unknownAttempts, 2, "install cannot restart a terminal failed probe");
  assert.equal(
    diagnostics.filter(([code]) => code === "runtime_adapter_unsupported").length,
    1,
    "unsupported diagnosis is emitted once per runtime",
  );
})();
"#,
    );
}

#[test]
fn runtime_detection_is_bounded_shared_and_root_scoped() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

(async () => {
  const diagnostics = [];
  const timeoutSlices = [];
  let attempts = 0;
  const root = {};
  const environment = {
    root,
    timeoutMs: 10,
    maxAttempts: 2,
    loadModule: () => {
      attempts += 1;
      return new Promise(() => {});
    },
    timer: {
      setTimeout(callback, milliseconds) {
        timeoutSlices.push(milliseconds);
        return setTimeout(callback, milliseconds);
      },
      clearTimeout,
    },
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  };
  const firstFactoryRuntime = createRuntimeCompatibility(environment);
  const secondFactoryRuntime = createRuntimeCompatibility(environment);
  const [detected, duplicateDetected] = await Promise.all([
    firstFactoryRuntime.detectCapabilities(),
    secondFactoryRuntime.detectCapabilities(),
  ]);
  assert.equal(detected.status, "unsupported");
  assert.deepStrictEqual(duplicateDetected, detected);
  assert.equal(attempts, 2, "concurrent detect calls share one bounded in-flight probe");
  assert.ok(
    timeoutSlices.reduce((sum, value) => sum + value, 0) <= environment.timeoutMs,
    "all attempts share one configured timeout budget",
  );
  await firstFactoryRuntime.detectCapabilities();
  await secondFactoryRuntime.detectCapabilities();
  assert.equal(attempts, 2, "terminal failure never resumes polling");
  assert.equal(
    diagnostics.filter(([code]) => code === "runtime_adapter_timeout").length,
    1,
    "timeout diagnosis is emitted once",
  );
  assert.equal(
    diagnostics.filter(([code]) => code === "runtime_adapter_unsupported").length,
    1,
    "terminal unsupported diagnosis is emitted once",
  );

  let otherAttempts = 0;
  const otherRuntime = createRuntimeCompatibility({
    root: {},
    maxAttempts: 1,
    loadModule: async () => {
      otherAttempts += 1;
      return {};
    },
  });
  await otherRuntime.detectCapabilities();
  assert.equal(otherAttempts, 1, "different roots have isolated adapter state");
})();
"#,
    );
}

#[test]
fn runtime_interceptors_share_one_transport_and_isolate_feature_failures() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const scriptPath = __SCRIPT_PATH__;
const { createRuntimeCompatibility } = require(scriptPath);

function featureHandlers(log) {
  return {
    broken(request) {
      log.push(["broken", request.kind]);
      throw new Error("broken feature");
    },
    first(request) {
      log.push(["first", request.kind, request.params]);
      return { ...request.params, first: true };
    },
    second(request) {
      log.push(["second", request.kind, request.params]);
      return request.kind === "StartThread" ? { ...request.params, second: true } : null;
    },
    undefinedPassthrough(request) {
      log.push(["undefined", request.kind]);
      return undefined;
    },
    nullPassthrough(request) {
      log.push(["null", request.kind]);
      return null;
    },
  };
}

async function bundleContract() {
  const log = [];
  const diagnostics = [];
  let loads = 0;
  const dispatcher = {
    marker: "dispatcher-this",
    calls: [],
    dispatchMessage(type, payload) {
      assert.equal(this.marker, "dispatcher-this");
      this.calls.push([type, payload]);
      return { type, payload, marker: this.marker };
    },
  };
  const root = { dispatchEvent() { throw new Error("bundle must be preferred"); } };
  const environment = {
    root,
    loadModule: async () => { loads += 1; return { nested: { dispatcher } }; },
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  };
  const runtime = createRuntimeCompatibility(environment);
  const originalTransport = dispatcher.dispatchMessage;
  const handlers = featureHandlers(log);
  const [detected, ...installs] = await Promise.all([
    runtime.detectCapabilities(),
    runtime.installRequestInterceptor("broken", handlers.broken, { failureThreshold: 1 }),
    runtime.installRequestInterceptor("first", handlers.first),
    runtime.installRequestInterceptor("second", handlers.second),
    runtime.installRequestInterceptor("undefined", handlers.undefinedPassthrough),
    runtime.installRequestInterceptor("null", handlers.nullPassthrough),
  ]);
  assert.equal(detected.requestInterceptor.adapter, "bundle-dispatcher");
  assert.ok(installs.every((result) => result.installed && result.adapter === "bundle-dispatcher"));
  assert.equal(loads, 1, "detect and installs share one probe");
  assert.notEqual(dispatcher.dispatchMessage, originalTransport);
  const installedTransport = dispatcher.dispatchMessage;

  delete require.cache[require.resolve(scriptPath)];
  const reloadedFactory = require(scriptPath).createRuntimeCompatibility;
  const recreated = reloadedFactory(environment);
  await recreated.installRequestInterceptor("second", (request) => {
    log.push(["second-replacement", request.kind, request.params]);
    return { ...request.params, second: true };
  });
  assert.equal(dispatcher.dispatchMessage, installedTransport, "same root never nests wrappers");

  const rawPayload = { request: { method: "thread/start", params: { cwd: "/repo" } } };
  const snapshot = structuredClone(rawPayload);
  const result = dispatcher.dispatchMessage("mcp-request", rawPayload);
  assert.deepStrictEqual(rawPayload, snapshot, "raw input remains immutable");
  assert.deepStrictEqual(result, {
    type: "mcp-request",
    payload: { request: { method: "thread/start", params: { cwd: "/repo", first: true, second: true } } },
    marker: "dispatcher-this",
  });
  dispatcher.dispatchMessage("mcp-request", rawPayload);
  assert.equal(log.filter(([name]) => name === "broken").length, 1, "only broken feature is disabled");
  assert.equal(log.filter(([name]) => name === "first").length, 2, "healthy feature remains active");
  assert.equal(log.filter(([name]) => name === "undefined").length, 2);
  assert.equal(log.filter(([name]) => name === "null").length, 2);
  assert.equal(diagnostics.filter(([code]) => code === "runtime_handler_disabled").length, 1);

  const unknownPayload = { untouched: true };
  const unknownResult = dispatcher.dispatchMessage("unknown-message", unknownPayload);
  assert.equal(dispatcher.calls.at(-1)[1], unknownPayload, "unknown payload passes by identity");
  assert.equal(unknownResult.payload, unknownPayload);

  const defaultBreakerDispatcher = {
    dispatchMessage(type, payload) { return { type, payload }; },
  };
  const defaultBreakerRuntime = createRuntimeCompatibility({
    root: {},
    loadModule: async () => ({ dispatcher: defaultBreakerDispatcher }),
  });
  let defaultBreakerCalls = 0;
  await defaultBreakerRuntime.installRequestInterceptor("default-breaker", () => {
    defaultBreakerCalls += 1;
    throw new Error("default threshold");
  });
  for (let index = 0; index < 4; index += 1) {
    defaultBreakerDispatcher.dispatchMessage("mcp-request", rawPayload);
  }
  assert.equal(defaultBreakerCalls, 3, "default breaker disables on its third failure");
  return result.payload.request.params;
}

async function windowEventContract() {
  const log = [];
  const dispatched = [];
  const root = {
    dispatchEvent(event) {
      dispatched.push(event);
      return event.returnValue;
    },
  };
  const createCalls = [];
  const runtime = createRuntimeCompatibility({
    root,
    maxAttempts: 1,
    loadModule: async () => ({}),
    createEvent(type, detail, original) {
      createCalls.push([type, detail, original]);
      return {
        type,
        detail,
        bubbles: original.bubbles,
        cancelable: original.cancelable,
        composed: original.composed,
        returnValue: original.returnValue,
      };
    },
  });
  assert.equal((await runtime.detectCapabilities()).requestInterceptor.status, "degraded");
  const handlers = featureHandlers(log);
  await runtime.installRequestInterceptor("first", handlers.first);
  await runtime.installRequestInterceptor("second", handlers.second);
  const installedTransport = root.dispatchEvent;
  await runtime.installRequestInterceptor("second", handlers.second);
  assert.equal(root.dispatchEvent, installedTransport, "repeated install never nests wrappers");

  const event = {
    type: "codex-message-from-view",
    detail: { type: "mcp-request", request: { method: "thread/start", params: { cwd: "/repo" } } },
    bubbles: true,
    cancelable: false,
    composed: true,
    returnValue: "event-result",
  };
  assert.equal(root.dispatchEvent(event), "event-result");
  assert.equal(createCalls.length, 1);
  assert.deepStrictEqual(dispatched.at(-1).detail.request.params, {
    cwd: "/repo", first: true, second: true,
  });
  assert.deepStrictEqual(
    [dispatched.at(-1).bubbles, dispatched.at(-1).cancelable, dispatched.at(-1).composed],
    [true, false, true],
  );
  assert.equal((await runtime.detectCapabilities()).requestInterceptor.status, "supported");

  const unrelated = { type: "other-event", detail: { untouched: true } };
  root.dispatchEvent(unrelated);
  assert.equal(dispatched.at(-1), unrelated, "unrelated event passes by identity");
  return dispatched[0].detail.request.params;
}

(async () => {
  assert.deepStrictEqual(await bundleContract(), await windowEventContract());
})();
"#,
    );
}

#[test]
fn runtime_install_failure_is_terminal_and_downgrades_capability() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

async function exerciseReadOnlyTransport(kind) {
  const diagnostics = [];
  let calls = 0;
  let installAttempts = 0;
  const original = () => true;
  let root;
  let loadModule;
  if (kind === "bundle") {
    const dispatcher = new Proxy({ dispatchMessage: original }, {
      set(target, key) {
        if (key === "dispatchMessage") installAttempts += 1;
        return true;
      },
    });
    root = {};
    loadModule = async () => ({ dispatcher });
  } else {
    root = new Proxy({ dispatchEvent: original }, {
      set(target, key) {
        if (key === "dispatchEvent") installAttempts += 1;
        return true;
      },
    });
    loadModule = async () => ({});
  }
  const runtime = createRuntimeCompatibility({
    root,
    maxAttempts: 1,
    loadModule,
    diagnostic(code, detail) { diagnostics.push([code, detail]); },
  });
  const selected = await runtime.detectCapabilities();
  assert.notEqual(selected.requestInterceptor.status, "unsupported");
  for (let index = 0; index < 3; index += 1) {
    const result = await runtime.installRequestInterceptor("feature", () => {
      calls += 1;
      return null;
    });
    assert.deepStrictEqual(result, { status: "unsupported", installed: false, adapter: null });
  }
  assert.equal(calls, 0);
  assert.equal(installAttempts, 1, `${kind} transport installation is attempted once`);
  assert.deepStrictEqual((await runtime.detectCapabilities()).requestInterceptor, {
    status: "unsupported",
    adapter: null,
  });
  assert.equal(
    diagnostics.filter(([code]) => code === "runtime_adapter_install_failed").length,
    1,
    `${kind} install failure is diagnosed once`,
  );
}

(async () => {
  await exerciseReadOnlyTransport("bundle");
  await exerciseReadOnlyTransport("window");
})();
"#,
    );
}

#[test]
fn runtime_handler_input_is_deeply_isolated_from_raw_payload() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

(async () => {
  const dispatcher = {
    dispatchMessage(type, payload) { return { type, payload }; },
  };
  const runtime = createRuntimeCompatibility({
    root: {},
    loadModule: async () => ({ dispatcher }),
  });
  await runtime.installRequestInterceptor("mutating-handler", (request) => {
    request.params.startingState.branchName = "mutated";
    request.params.items[0].name = "changed";
    request.params.self = request.params;
    return null;
  });
  const params = {
    startingState: { type: "branch", branchName: "main" },
    items: [{ name: "original" }],
    createdAt: new Date(0),
    amount: 1n,
  };
  params.self = params;
  const payload = { request: { method: "thread/start", params } };
  const result = dispatcher.dispatchMessage("mcp-request", payload);
  assert.equal(payload.request.params.startingState.branchName, "main");
  assert.equal(payload.request.params.items[0].name, "original");
  assert.equal(payload.request.params.createdAt.getTime(), 0);
  assert.equal(payload.request.params.amount, 1n);
  assert.equal(payload.request.params.self, payload.request.params, "raw cycle remains intact");
  assert.equal(result.payload, payload, "null passthrough preserves the raw payload identity");
})();
"#,
    );
}

#[test]
fn runtime_handler_boundary_sanitizes_inputs_and_rejects_invalid_outputs() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

class MutableClass { constructor() { this.value = "raw"; } }

(async () => {
  const diagnostics = [];
  const dispatcher = {
    dispatchMessage(type, payload) { return { type, payload }; },
  };
  const runtime = createRuntimeCompatibility({
    root: {},
    loadModule: async () => ({ dispatcher }),
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  });

  const date = new Date(0);
  const special = JSON.parse('{"__proto__":{"polluted":true},"constructor":"own","prototype":"own-prototype"}');
  const params = { date, special };
  let cursor = params;
  for (let depth = 0; depth < 10; depth += 1) {
    cursor.deep = {};
    cursor = cursor.deep;
  }

  await runtime.installRequestInterceptor("inspect", (request) => {
    assert.notEqual(request.params.date, date);
    request.params.date.setTime(1234);
    assert.equal(Object.getPrototypeOf(request.params.special), Object.prototype);
    assert.equal(Object.hasOwn(request.params.special, "__proto__"), true);
    assert.deepStrictEqual(request.params.special.__proto__, { polluted: true });
    assert.equal(request.params.special.constructor, "own");
    assert.equal(request.params.special.prototype, "own-prototype");
    let depth = 0;
    let nested = request.params;
    while (nested?.deep) {
      depth += 1;
      nested = nested.deep;
    }
    assert.equal(depth, 10);
    return null;
  });
  for (const [featureId, invalid] of [
    ["promise-output", Promise.resolve({ invalid: true })],
    ["date-output", new Date()],
    ["map-output", new Map()],
    ["class-output", new MutableClass()],
    ["array-output", []],
  ]) {
    await runtime.installRequestInterceptor(featureId, () => invalid, { failureThreshold: 1 });
  }
  await runtime.installRequestInterceptor("healthy-output", (request) => ({
    ...request.params,
    healthy: true,
  }));

  const payload = { request: { method: "thread/start", params } };
  const result = dispatcher.dispatchMessage("mcp-request", payload);
  assert.equal(date.getTime(), 0);
  assert.equal({}.polluted, undefined);
  assert.equal(result.payload.request.params.healthy, true);
  assert.ok(
    diagnostics.some(([code]) => code === "runtime_handler_disabled"),
    "invalid output is a diagnosed feature failure",
  );
})();
"#,
    );
}

#[test]
fn runtime_feature_faults_are_scoped_safe_and_consecutive() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

(async () => {
  const diagnostics = [];
  const dispatcher = {
    dispatchMessage(type, payload) { return { type, payload }; },
  };
  const runtime = createRuntimeCompatibility({
    root: {},
    loadModule: async () => ({ dispatcher }),
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  });
  const hostile = new Proxy({}, { get() { throw new Error("proxy getter"); } });
  const nullPrototypeError = Object.create(null);
  for (const [featureId, thrown] of [
    ["proxy-throw", hostile],
    ["null-prototype-throw", nullPrototypeError],
    ["string-throw", "plain string"],
  ]) {
    await runtime.installRequestInterceptor(featureId, () => { throw thrown; }, {
      failureThreshold: 1,
    });
  }
  await runtime.installRequestInterceptor("healthy", (request) => ({
    ...request.params,
    healthy: true,
  }));
  const payload = { request: { method: "thread/start", params: { cwd: "/repo" } } };
  const first = dispatcher.dispatchMessage("mcp-request", payload);
  assert.equal(first.payload.request.params.healthy, true, "hostile thrown values cannot stop peers");
  assert.deepStrictEqual(
    diagnostics
      .filter(([code]) => code === "runtime_handler_disabled")
      .map(([, detail]) => detail.featureId)
      .sort(),
    ["null-prototype-throw", "proxy-throw", "string-throw"],
    "each feature receives its own one-time diagnosis",
  );

  let consecutiveCalls = 0;
  await runtime.installRequestInterceptor("consecutive", () => {
    consecutiveCalls += 1;
    if (consecutiveCalls === 2) return null;
    throw new Error(`failure-${consecutiveCalls}`);
  }, { failureThreshold: 2 });
  for (let index = 0; index < 5; index += 1) {
    dispatcher.dispatchMessage("mcp-request", payload);
  }
  assert.equal(
    consecutiveCalls,
    4,
    "success resets failures, then two consecutive failures disable before fifth call",
  );
  assert.equal(
    diagnostics.filter(
      ([code, detail]) => code === "runtime_handler_disabled" && detail.featureId === "consecutive",
    ).length,
    1,
  );
})();
"#,
    );
}

#[test]
fn runtime_nested_lossy_outputs_accumulate_consecutive_failures() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

(async () => {
  const diagnostics = [];
  const dispatcher = {
    dispatchMessage(type, payload) { return { type, payload }; },
  };
  const runtime = createRuntimeCompatibility({
    root: {},
    loadModule: async () => ({ dispatcher }),
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  });
  let lossyCalls = 0;
  await runtime.installRequestInterceptor("nested-lossy", (request) => {
    lossyCalls += 1;
    return { ...request.params, nested: { unsupported() {} } };
  }, { failureThreshold: 2 });
  const payload = { request: { method: "thread/start", params: { cwd: "/repo" } } };
  for (let index = 0; index < 3; index += 1) {
    const result = dispatcher.dispatchMessage("mcp-request", payload);
    assert.equal(result.payload, payload, "lossy output is never partially written");
  }
  assert.equal(lossyCalls, 2, "two consecutive lossy outputs open the feature breaker");
  assert.equal(
    diagnostics.filter(
      ([code, detail]) => code === "runtime_handler_disabled" && detail.featureId === "nested-lossy",
    ).length,
    1,
  );
})();
"#,
    );
}

#[test]
fn runtime_registry_survives_reload_and_bundle_probe_is_bounded() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const scriptPath = __SCRIPT_PATH__;

async function exerciseReload(root) {
  let exported = require(scriptPath);
  const dispatcher = {
    dispatchMessage(type, payload) { return { type, payload }; },
  };
  const environment = { root, loadModule: async () => ({ dispatcher }) };
  const first = exported.createRuntimeCompatibility(environment);
  await first.installRequestInterceptor("first", (request) => ({ ...request.params, first: true }));
  const wrapper = dispatcher.dispatchMessage;

  delete require.cache[require.resolve(scriptPath)];
  exported = require(scriptPath);
  const second = exported.createRuntimeCompatibility(environment);
  await second.installRequestInterceptor("second", (request) => ({ ...request.params, second: true }));
  assert.equal(dispatcher.dispatchMessage, wrapper, "reload reuses the existing wrapper");
  const result = dispatcher.dispatchMessage("mcp-request", {
    request: { method: "thread/start", params: { cwd: "/repo" } },
  });
  assert.deepStrictEqual(result.payload.request.params, {
    cwd: "/repo", first: true, second: true,
  });
}

(async () => {
  await exerciseReload(Object.preventExtensions({}));
  await exerciseReload(new Proxy({}, {
    defineProperty() { return false; },
  }));

  const diagnostics = [];
  let getterReads = 0;
  const graph = {};
  for (let index = 0; index < 64; index += 1) {
    Object.defineProperty(graph, `node${index}`, {
      enumerable: true,
      get() { getterReads += 1; return { next: graph }; },
    });
  }
  graph.cycle = graph;
  graph.dispatcherAtEnd = { dispatchMessage() {} };
  const exported = require(scriptPath);
  const runtime = exported.createRuntimeCompatibility({
    root: {},
    loadModule: async () => graph,
    maxAttempts: 1,
    probeMaxNodes: 4,
    probeMaxKeys: 8,
    probeMaxDepth: 3,
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  });
  assert.equal((await runtime.detectCapabilities()).status, "unsupported");
  await runtime.detectCapabilities();
  assert.equal(getterReads, 0, "bundle graph probe never invokes accessors");
  assert.equal(
    diagnostics.filter(([code]) => code === "runtime_bundle_probe_budget_exhausted").length,
    1,
  );
})();
"#,
    );
}

#[test]
fn runtime_transport_timer_and_environment_boundaries_fail_safe() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

(async () => {
  const bundleDiagnostics = [];
  const bundleCalls = [];
  const dispatcher = {
    dispatchMessage(type, payload) { bundleCalls.push([type, payload]); return "original-result"; },
  };
  const bundleRuntime = createRuntimeCompatibility({
    root: {},
    loadModule: async () => ({ dispatcher }),
    diagnostic: (code, detail) => bundleDiagnostics.push([code, detail]),
  });
  await bundleRuntime.installRequestInterceptor("noop", () => null);
  const hostileUnknown = new Proxy({}, { ownKeys() { throw new Error("must not inspect unknown"); } });
  assert.equal(dispatcher.dispatchMessage("unknown-message", hostileUnknown), "original-result");
  assert.equal(bundleCalls.at(-1)[1], hostileUnknown);

  const hostileKnown = {};
  Object.defineProperty(hostileKnown, "request", {
    enumerable: true,
    get() { throw new Error("known getter"); },
  });
  assert.equal(dispatcher.dispatchMessage("mcp-request", hostileKnown), "original-result");
  assert.equal(bundleCalls.at(-1)[1], hostileKnown);
  const hostileRaw = new Proxy({}, { get() { throw new Error("normalize getter"); } });
  assert.equal(bundleRuntime.normalizeRequest(hostileRaw), null);
  assert.equal(
    bundleDiagnostics.filter(([code]) => code === "runtime_transport_message_failed").length,
    1,
  );

  const windowDiagnostics = [];
  const events = [];
  const root = { dispatchEvent(event) { events.push(event); return true; } };
  const windowRuntime = createRuntimeCompatibility({
    root,
    maxAttempts: 1,
    loadModule: async () => ({}),
    diagnostic: (code, detail) => windowDiagnostics.push([code, detail]),
  });
  await windowRuntime.installRequestInterceptor("noop", () => null);
  const hostileEvent = { type: "codex-message-from-view" };
  Object.defineProperty(hostileEvent, "detail", { get() { throw new Error("detail getter"); } });
  assert.equal(root.dispatchEvent(hostileEvent), true);
  assert.equal(events.at(-1), hostileEvent);
  const hostileTypeEvent = new Proxy({}, { get() { throw new Error("type getter"); } });
  assert.equal(root.dispatchEvent(hostileTypeEvent), true);
  assert.equal(events.at(-1), hostileTypeEvent);
  assert.equal(
    windowDiagnostics.filter(([code]) => code === "runtime_transport_message_failed").length,
    1,
  );

  let orphanSetCalls = 0;
  const timeoutDiagnostics = [];
  const timeoutRuntime = createRuntimeCompatibility({
    root: {},
    timeoutMs: 8,
    maxAttempts: 1,
    loadModule: () => new Promise(() => {}),
    timer: { setTimeout() { orphanSetCalls += 1; return Symbol("foreign"); } },
    diagnostic: (code, detail) => timeoutDiagnostics.push([code, detail]),
  });
  await timeoutRuntime.detectCapabilities();
  assert.equal(orphanSetCalls, 0, "an unpaired custom timer is never selected");
  const timeoutDetail = timeoutDiagnostics.find(([code]) => code === "runtime_adapter_timeout")?.[1];
  assert.equal(timeoutDetail.totalTimeoutMs, 8);
  assert.equal(timeoutDetail.attemptTimeoutMs, 8);

  const timerIds = [];
  const clearedIds = [];
  const pairedTimerRuntime = createRuntimeCompatibility({
    root: {},
    timeoutMs: 10,
    maxAttempts: 1,
    loadModule: () => new Promise(() => {}),
    timer: {
      setTimeout(callback) {
        const id = Symbol("paired-timer");
        timerIds.push(id);
        queueMicrotask(callback);
        return id;
      },
      clearTimeout(id) { clearedIds.push(id); },
    },
  });
  await pairedTimerRuntime.detectCapabilities();
  assert.deepStrictEqual(clearedIds, timerIds);

  const supplementRoot = {};
  const early = createRuntimeCompatibility({ root: supplementRoot });
  let supplementedLoads = 0;
  let supplementedTimerSets = 0;
  let supplementedTimerClears = 0;
  const supplementDiagnostics = [];
  const supplementedDispatcher = { dispatchMessage() {} };
  const configured = createRuntimeCompatibility({
    root: supplementRoot,
    loadModule: async () => { supplementedLoads += 1; return { dispatcher: supplementedDispatcher }; },
    diagnostic: (code, detail) => supplementDiagnostics.push([code, detail]),
    timer: {
      setTimeout(callback, milliseconds) {
        supplementedTimerSets += 1;
        return setTimeout(callback, milliseconds);
      },
      clearTimeout(id) {
        supplementedTimerClears += 1;
        clearTimeout(id);
      },
    },
  });
  assert.equal((await early.detectCapabilities()).requestInterceptor.adapter, "bundle-dispatcher");
  assert.equal((await configured.detectCapabilities()).requestInterceptor.adapter, "bundle-dispatcher");
  assert.equal(supplementedLoads, 1);
  assert.deepStrictEqual([supplementedTimerSets, supplementedTimerClears], [1, 1]);

  const diagnosticRoot = {};
  const beforeDiagnostic = createRuntimeCompatibility({ root: diagnosticRoot });
  const supplementedDiagnosticCalls = [];
  createRuntimeCompatibility({
    root: diagnosticRoot,
    maxAttempts: 1,
    loadModule: async () => ({}),
    diagnostic: (code, detail) => supplementedDiagnosticCalls.push([code, detail]),
  });
  await beforeDiagnostic.detectCapabilities();
  assert.equal(
    supplementedDiagnosticCalls.filter(([code]) => code === "runtime_adapter_unsupported").length,
    1,
  );

  const firstWriterRoot = {};
  let firstLoads = 0;
  let secondLoads = 0;
  const firstWriter = createRuntimeCompatibility({
    root: firstWriterRoot,
    loadModule: async () => { firstLoads += 1; return { dispatcher: supplementedDispatcher }; },
  });
  createRuntimeCompatibility({
    root: firstWriterRoot,
    loadModule: async () => { secondLoads += 1; return {}; },
  });
  await firstWriter.detectCapabilities();
  assert.deepStrictEqual([firstLoads, secondLoads], [1, 0], "non-empty first dependency wins");
})();
"#,
    );
}

#[test]
fn runtime_bundle_probe_supports_bounded_prototype_dispatch_methods() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

(async () => {
  class Dispatcher {
    constructor() { this.marker = "instance-this"; this.calls = []; }
    dispatchMessage(type, payload) {
      assert.equal(this.marker, "instance-this");
      this.calls.push([type, payload]);
      return { type, payload, marker: this.marker };
    }
  }
  const dispatcher = new Dispatcher();
  class Holder { static getInstance() { return dispatcher; } }
  const runtime = createRuntimeCompatibility({
    root: {},
    loadModule: async () => ({ v: Holder }),
  });
  assert.deepStrictEqual((await runtime.detectCapabilities()).requestInterceptor, {
    status: "supported",
    adapter: "bundle-dispatcher",
  });
  assert.equal((await runtime.installRequestInterceptor("feature", (request) => ({
    ...request.params,
    installed: true,
  }))).installed, true);
  const result = dispatcher.dispatchMessage("mcp-request", {
    request: { method: "thread/start", params: { cwd: "/repo" } },
  });
  assert.equal(result.marker, "instance-this");
  assert.equal(result.payload.request.params.installed, true);

  let getterReads = 0;
  class AccessorDispatcher {}
  Object.defineProperty(AccessorDispatcher.prototype, "dispatchMessage", {
    get() { getterReads += 1; return () => {}; },
  });
  class AccessorHolder { static getInstance() { return new AccessorDispatcher(); } }
  const rejected = createRuntimeCompatibility({
    root: {},
    maxAttempts: 1,
    loadModule: async () => ({ v: AccessorHolder }),
  });
  assert.equal((await rejected.detectCapabilities()).status, "unsupported");
  assert.equal(getterReads, 0, "prototype accessors are never invoked");
})();
"#,
    );
}

#[test]
fn runtime_incomplete_sanitization_skips_handlers_and_preserves_raw_identity() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

(async () => {
  const diagnostics = [];
  const dispatcher = {
    calls: [],
    dispatchMessage(type, payload) { this.calls.push([type, payload]); return payload; },
  };
  const runtime = createRuntimeCompatibility({
    root: {},
    loadModule: async () => ({ dispatcher }),
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  });
  let handlerCalls = 0;
  await runtime.installRequestInterceptor("must-not-run", (request) => {
    handlerCalls += 1;
    return { ...request.params, overwritten: true };
  });

  const deep = { sentinel: "preserve-me" };
  let cursor = deep;
  for (let depth = 0; depth < 40; depth += 1) {
    cursor.next = { sentinel: `depth-${depth}` };
    cursor = cursor.next;
  }
  class Unsupported { constructor() { this.value = "class-value"; } }
  const unsupported = {
    fn: Object.assign(() => {}, { mutable: "function-value" }),
    instance: new Unsupported(),
    map: new Map([["key", "map-value"]]),
  };
  let accessorReads = 0;
  const accessor = { stable: "preserve" };
  Object.defineProperty(accessor, "unsafe", {
    enumerable: true,
    get() { accessorReads += 1; return "must-not-read"; },
  });
  const wide = {};
  for (let index = 0; index < 4100; index += 1) wide[`key${index}`] = index;

  for (const params of [deep, unsupported, accessor, wide]) {
    const payload = { request: { method: "thread/start", params } };
    assert.equal(runtime.normalizeRequest({ type: "mcp-request", ...payload }), null);
    assert.equal(dispatcher.dispatchMessage("mcp-request", payload), payload);
    assert.equal(dispatcher.calls.at(-1)[1], payload);
    assert.equal("overwritten" in params, false);
  }
  assert.equal(handlerCalls, 0);
  assert.equal(accessorReads, 0);
  assert.equal(
    diagnostics.filter(([code]) => code === "runtime_request_sanitize_incomplete").length,
    1,
  );
})();
"#,
    );
}

#[test]
fn runtime_protocol_normalizes_all_supported_upstream_shapes() {
    let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(std::path::Path::parent)
        .expect("core crate should live under crates/chatgpt-plus-core");
    let script_path = repo.join("assets/inject/runtime-compat.js");
    let temp = tempfile::tempdir().expect("temp dir should be created");
    let harness_path = temp.path().join("runtime-compat-harness.cjs");
    let script_path_json =
        serde_json::to_string(&script_path).expect("script path should serialize as JSON");
    let harness = r#"
const assert = require("node:assert/strict");
const scriptPath = __SCRIPT_PATH__;
const exported = require(scriptPath);
const runtime = exported.createRuntimeCompatibility({});

const cases = [
  {
    name: "mcp thread start",
    raw: { type: "mcp-request", request: { method: "thread/start", params: { cwd: "/repo" } } },
    expected: { kind: "StartThread", params: { cwd: "/repo" }, threadId: null, sourceAdapter: "NestedParams" },
  },
  {
    name: "direct host resume",
    raw: { type: "send-cli-request-for-host", method: "thread/resume", params: { threadId: "t-1" } },
    expected: { kind: "ResumeThread", params: { threadId: "t-1" }, threadId: "t-1", sourceAdapter: "DirectParams" },
  },
  {
    name: "worker resume",
    raw: { type: "worker-request", request: { method: "thread/resume", params: { conversationId: "legacy-1" } } },
    expected: { kind: "ResumeThread", params: { conversationId: "legacy-1" }, threadId: "legacy-1", sourceAdapter: "NestedParams" },
  },
  {
    name: "nested prewarm thread start",
    raw: { type: "thread-prewarm-start", request: { traceId: "trace-1", params: { cwd: "/prewarm" } } },
    expected: { kind: "StartThread", params: { cwd: "/prewarm" }, threadId: null, sourceAdapter: "NestedParams" },
  },
  {
    name: "direct prewarm thread start",
    raw: { type: "prewarm-thread-start-for-host", channel: "host", params: { cwd: "/host-prewarm" } },
    expected: { kind: "StartThread", params: { cwd: "/host-prewarm" }, threadId: null, sourceAdapter: "DirectParams" },
  },
  {
    name: "inline conversation start",
    raw: { type: "start-conversation", cwd: "/conversation", conversationId: "not-a-resume" },
    expected: { kind: "StartThread", params: { cwd: "/conversation", conversationId: "not-a-resume" }, threadId: null, sourceAdapter: "InlinePayload" },
  },
  {
    name: "inline host thread start",
    raw: { type: "start-thread-for-host", cwd: "/host" },
    expected: { kind: "StartThread", params: { cwd: "/host" }, threadId: null, sourceAdapter: "InlinePayload" },
  },
  {
    name: "turn start with outer conversation id",
    raw: { type: "start-turn-for-host", conversationId: "outer-1", params: { input: "hello" } },
    expected: { kind: "StartTurn", params: { input: "hello" }, threadId: "outer-1", sourceAdapter: "DirectParams" },
  },
  {
    name: "turn start with params conversation id",
    raw: { type: "start-turn-for-host", conversationId: "outer-ignored", params: { conversationId: "inner-1" } },
    expected: { kind: "StartTurn", params: { conversationId: "inner-1" }, threadId: "inner-1", sourceAdapter: "DirectParams" },
  },
  {
    name: "mcp model list",
    raw: { type: "mcp-request", request: { method: "list-models-for-host", params: { includeHidden: true } } },
    expected: { kind: "ListModels", params: { includeHidden: true }, threadId: null, sourceAdapter: "NestedParams" },
  },
  {
    name: "legacy mcp model list",
    raw: { type: "mcp-request", request: { method: "model/list", params: {} } },
    expected: { kind: "ListModels", params: {}, threadId: null, sourceAdapter: "NestedParams" },
  },
  {
    name: "direct model list",
    raw: { type: "send-cli-request-for-host", method: "list-models-for-host", params: { includeHidden: false, threadId: "not-a-thread-request" } },
    expected: { kind: "ListModels", params: { includeHidden: false, threadId: "not-a-thread-request" }, threadId: null, sourceAdapter: "DirectParams" },
  },
  {
    name: "host wrapped model list",
    raw: {
      type: "send-cli-request-for-host",
      params: { method: "list-models-for-host", includeHidden: true },
    },
    expected: { kind: "ListModels", params: { includeHidden: true }, threadId: null, sourceAdapter: "HostWrapperParams" },
  },
  {
    name: "worktree create",
    raw: { type: "pending-worktree-create", request: { launchMode: "start-conversation", threadId: "not-a-thread-request" } },
    expected: { kind: "CreateWorktree", params: { launchMode: "start-conversation", threadId: "not-a-thread-request" }, threadId: null, sourceAdapter: "NestedPayload" },
  },
];

function payloadFor(request, sourceAdapter) {
  if (sourceAdapter === "NestedParams") return request.request.params;
  if (sourceAdapter === "DirectParams") return request.params;
  if (sourceAdapter === "HostWrapperParams") {
    const { method: _method, ...payload } = request.params;
    return payload;
  }
  if (sourceAdapter === "NestedPayload") return request.request;
  if (sourceAdapter === "InlinePayload") {
    const { type: _type, ...payload } = request;
    return payload;
  }
  return undefined;
}

function envelopeFor(request, sourceAdapter) {
  const envelope = structuredClone(request);
  if (sourceAdapter === "NestedParams") delete envelope.request.params;
  if (sourceAdapter === "DirectParams") delete envelope.params;
  if (sourceAdapter === "HostWrapperParams") {
    envelope.params = { method: envelope.params.method };
  }
  if (sourceAdapter === "NestedPayload") delete envelope.request;
  if (sourceAdapter === "InlinePayload") {
    for (const key of Object.keys(envelope)) {
      if (key !== "type") delete envelope[key];
    }
  }
  return envelope;
}

for (const testCase of cases) {
  assert.deepStrictEqual(runtime.normalizeRequest(testCase.raw), testCase.expected, testCase.name);

  // A conflicting type is intentional: inline replacement must retain the
  // upstream discriminator rather than allowing feature params to replace it.
  const nextParams = {
    type: "conflicting-feature-type",
    marker: testCase.name,
    threadId: "next-thread",
    ...(testCase.expected.kind === "CreateWorktree" ? { launchMode: "start-conversation" } : {}),
  };
  const replaced = runtime.replaceRequestParams(testCase.raw, testCase.expected, nextParams);
  assert.deepStrictEqual(
    envelopeFor(replaced, testCase.expected.sourceAdapter),
    envelopeFor(testCase.raw, testCase.expected.sourceAdapter),
    `${testCase.name}: envelope`,
  );
  assert.equal(replaced.type, testCase.raw.type, `${testCase.name}: discriminator`);
  const expectedPayload = testCase.expected.sourceAdapter === "InlinePayload"
    ? { marker: testCase.name, threadId: "next-thread" }
    : nextParams;
  assert.deepStrictEqual(
    payloadFor(replaced, testCase.expected.sourceAdapter),
    expectedPayload,
    `${testCase.name}: payload`,
  );
  const renormalized = runtime.normalizeRequest(replaced);
  assert.equal(renormalized?.kind, testCase.expected.kind, `${testCase.name}: renormalize`);
  assert.equal(
    renormalized?.threadId,
    testCase.expected.kind === "ListModels" || testCase.expected.kind === "CreateWorktree"
      ? null
      : "next-thread",
    `${testCase.name}: replacement thread id semantics`,
  );
}

assert.equal(runtime.normalizeRequest({ type: "unknown-request", payload: { ignored: true } }), null);
for (const raw of [
  { type: "pending-worktree-create", request: { launchMode: "open-existing", startingState: { type: "branch" } } },
  { type: "pending-worktree-create", request: { startingState: { type: "branch" } } },
]) {
  assert.equal(
    runtime.normalizeRequest(raw),
    null,
    "non-conversation worktree requests must remain outside the internal CreateWorktree protocol",
  );
}
for (const method of ["toString", "constructor"]) {
  assert.equal(
    runtime.normalizeRequest({ type: "mcp-request", request: { method, params: {} } }),
    null,
    `nested prototype method ${method}`,
  );
  assert.equal(
    runtime.normalizeRequest({ type: "send-cli-request-for-host", method, params: {} }),
    null,
    `direct prototype method ${method}`,
  );
  assert.equal(
    runtime.normalizeRequest({ type: "send-cli-request-for-host", params: { method } }),
    null,
    `wrapped prototype method ${method}`,
  );
}
assert.equal(
  runtime.normalizeRequest({
    type: "send-cli-request-for-host",
    method: "thread/start",
    params: { method: "thread/resume", threadId: "conflict" },
  }),
  null,
  "conflicting outer and wrapped methods must fail closed",
);
assert.deepStrictEqual(Object.keys(exported), ["apiVersion", "createRuntimeCompatibility"]);
assert.equal("SourceAdapter" in runtime, false);
assert.equal("UpstreamEnvelope" in runtime, false);

(async () => {
const capabilities = await runtime.detectCapabilities();
const interceptor = await runtime.installRequestInterceptor();
process.stdout.write(JSON.stringify({
  commonJsDoesNotInstallBrowserGlobal:
    globalThis.ChatGPTPlusRuntimeCompat === undefined &&
    globalThis.__chatgptPlusRuntimeCompatibility === undefined,
  caseCount: cases.length,
  internalRequestKinds: runtime.InternalRequestKind,
  supportStatus: runtime.SupportStatus,
  placeholders: {
    capabilities,
    interceptor,
    sessionObserver: runtime.observeSessions(),
    currentThread: runtime.resolveCurrentThread(),
    dom: runtime.dom,
  },
}));
})();
"#
    .replace("__SCRIPT_PATH__", &script_path_json);
    std::fs::write(&harness_path, harness).expect("harness should be written");

    let output = Command::new("node")
        .arg(&harness_path)
        .output()
        .expect("node should run runtime compatibility harness");
    assert!(
        output.status.success(),
        "node harness failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let actual: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("harness stdout should be JSON");

    assert_eq!(
        actual,
        json!({
            "commonJsDoesNotInstallBrowserGlobal": true,
            "caseCount": 14,
            "internalRequestKinds": {
                "StartThread": "StartThread",
                "ResumeThread": "ResumeThread",
                "StartTurn": "StartTurn",
                "ListModels": "ListModels",
                "CreateWorktree": "CreateWorktree",
            },
            "supportStatus": {
                "Supported": "supported",
                "Degraded": "degraded",
                "Unsupported": "unsupported",
            },
            "placeholders": {
                "capabilities": {
                    "status": "unsupported",
                    "requestInterceptor": {
                        "status": "unsupported",
                        "adapter": null,
                    },
                    "sessionObservation": { "status": "unsupported" },
                    "currentThreadResolution": { "status": "unsupported" },
                    "dom": { "status": "unsupported" },
                },
                "interceptor": { "status": "unsupported", "installed": false, "adapter": null },
                "sessionObserver": { "status": "unsupported", "active": false },
                "currentThread": null,
                "dom": {},
            },
        })
    );
}

#[test]
fn renderer_request_features_use_only_the_stable_runtime_contract() {
    let script = assets::renderer_script();
    assert!(script.contains("const runtimeFeatureInstallations = new Map()"));
    assert!(!script.contains("window.__chatgptPlusRuntimeFeatureInstallations"));
    assert!(script.contains("function codexServiceTierRuntimeRequestHandler(request, kinds)"));
    assert!(script.contains("function upstreamWorktreeRuntimeRequestHandler(request, kinds)"));
    assert!(script.contains("installRuntimeRequestFeature(\"service-tier\""));
    assert!(script.contains("installRuntimeRequestFeature(\"upstream-worktree\""));
    assert!(!script.contains("function codexServiceTierRequestOverride(message)"));
    assert!(!script.contains("function installCodexServiceTierDispatcherPatch"));
    assert!(!script.contains("function installUpstreamPendingWorktreeDispatcherPatch"));
}

#[test]
fn renderer_dom_lifecycle_uses_the_central_adapter_and_one_bounded_settle_window() {
    let script = assets::renderer_script();
    assert!(!script.contains("new MutationObserver"));
    assert!(!script.contains(".composer-footer"));
    assert!(!script.contains("data-radix-popper-content-wrapper"));
    assert!(script.contains("dom?.observe(\"conversation-view\""));
    assert!(script.contains("dom?.poll(\"conversation-view-settle\""));
    assert!(script.contains("maxAttempts: 24"));
    assert!(script.contains("if (!conversationViewState.pollStarted &&"));
    assert!(script.contains("if (document.body && !conversationViewState.observerStarted &&"));
    assert!(script.contains("conversationViewState.observerAttempts < 3"));
    assert!(script.contains("conversationViewState.pollAttempts < 3"));
    assert!(
        script
            .contains("conversationViewState.observerStarted = !!conversationViewState.mo?.active")
    );
    assert!(
        script
            .contains("conversationViewState.pollStarted = !!conversationViewState.pollId?.active")
    );
    assert!(script.contains("function resetRuntimeDomFeaturesForInjection()"));
    assert!(script.contains("runtime.dom.resetFeature(featureId)"));
    assert!(script.contains("runtimeDom(\"main-scan\")?.observe(\"main-scan\""));
    assert!(
        script.contains("runtimeDom(\"upstream-branch-observer\")?.observe(\"upstream-branch\"")
    );
}

#[test]
fn renderer_upstream_branch_reinjection_replaces_owned_listener_observer_and_timer() {
    let script = assets::renderer_script();
    assert!(!script.contains(
        "if (window.__codexUpstreamBranchDropdownAdapterInstalled === adapterVersion) return",
    ));
    assert!(script.contains(
        "document.removeEventListener(\"click\", window.__codexUpstreamBranchDropdownClickHandler",
    ));
    assert!(script.contains("window.__codexUpstreamBranchDropdownClickHandler = clickHandler"));
    assert!(script.contains("clearTimeout(window.__codexUpstreamBranchInjectTimer)"));
    assert!(
        script.contains("runtimeDom(\"upstream-branch-observer\")?.observe(\"upstream-branch\"",)
    );
}

#[test]
fn renderer_conversation_lifecycle_retries_are_behaviorally_bounded() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const renderer = fs.readFileSync(path.join(path.dirname(__SCRIPT_PATH__), "renderer-inject.js"), "utf8");
const stateStart = renderer.indexOf("const conversationViewState = {");
const stateEnd = renderer.indexOf("function conversationViewTokenSet", stateStart);
const ensureStart = renderer.indexOf("function ensureConversationViewRuntime()", stateEnd);
const ensureEnd = renderer.indexOf("function refreshConversationView()", ensureStart);
assert.ok(stateStart >= 0 && stateEnd > stateStart && ensureStart > stateEnd && ensureEnd > ensureStart);
const extracted = `${renderer.slice(stateStart, stateEnd)}\n${renderer.slice(ensureStart, ensureEnd)}`;

function lifecycle(activateOnAttempt) {
  let observeCalls = 0;
  let pollCalls = 0;
  let pollOptions = null;
  const dom = {
    observe() { observeCalls += 1; return { active: observeCalls >= activateOnAttempt }; },
    poll(_id, _callback, options) {
      pollCalls += 1;
      pollOptions = options;
      return { active: pollCalls >= activateOnAttempt };
    },
  };
  class FakeResizeObserver {}
  const create = new Function(
    "ResizeObserver", "scheduleConversationViewAlign", "document", "runtimeDom",
    `${extracted}\nreturn { conversationViewState, ensureConversationViewRuntime };`,
  );
  const value = create(FakeResizeObserver, () => {}, { body: {}, documentElement: {} }, () => dom);
  return { ...value, calls: () => ({ observeCalls, pollCalls, pollOptions }) };
}

const eventuallyActive = lifecycle(3);
for (let index = 0; index < 20; index += 1) eventuallyActive.ensureConversationViewRuntime();
assert.equal(eventuallyActive.calls().observeCalls, 3);
assert.equal(eventuallyActive.calls().pollCalls, 3);
assert.equal(eventuallyActive.conversationViewState.observerStarted, true);
assert.equal(eventuallyActive.conversationViewState.pollStarted, true);
assert.equal(eventuallyActive.calls().pollOptions.maxAttempts, 24);

const neverActive = lifecycle(Number.POSITIVE_INFINITY);
for (let index = 0; index < 20; index += 1) neverActive.ensureConversationViewRuntime();
assert.equal(neverActive.calls().observeCalls, 3, "temporary observer setup has a finite retry cap");
assert.equal(neverActive.calls().pollCalls, 3, "temporary poll setup has a finite retry cap");
assert.equal(neverActive.conversationViewState.observerStarted, false);
assert.equal(neverActive.conversationViewState.pollStarted, false);
"#,
    );
}

#[test]
fn runtime_dom_fixtures_share_one_semantic_contract_and_report_feature_status() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

function attributeNameToProperty(name) {
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseSimpleSelector(selector) {
  const source = selector.trim();
  const tag = source.match(/^[a-z][a-z0-9-]*/i)?.[0]?.toLowerCase() ?? null;
  const classes = [...source.matchAll(/\.([a-z0-9_-]+)/gi)].map((match) => match[1]);
  const attributes = [...source.matchAll(
    /\[([a-z0-9_-]+)(?:\s*(\*=|\^=|=)\s*(['"])(.*?)\3\s*(i)?)?\]/gi,
  )].map((match) => ({
    name: match[1], operator: match[2] ?? null, value: match[4] ?? null,
    insensitive: Boolean(match[5]),
  }));
  return { tag, classes, attributes };
}

function matchesSimpleSelector(node, selector) {
  const parsed = parseSimpleSelector(selector);
  if (parsed.tag && node.localName !== parsed.tag) return false;
  const classNames = new Set((node.getAttribute("class") ?? "").split(/\s+/).filter(Boolean));
  if (parsed.classes.some((name) => !classNames.has(name))) return false;
  return parsed.attributes.every(({ name, operator, value, insensitive }) => {
    const actual = node.getAttribute(name);
    if (actual === null) return false;
    if (!operator) return true;
    let left = actual;
    let right = value;
    if (insensitive) {
      left = left.toLowerCase();
      right = right.toLowerCase();
    }
    if (operator === "=") return left === right;
    return operator === "^=" ? left.startsWith(right) : left.includes(right);
  });
}

function splitSelector(source, separator) {
  const parts = [];
  let start = 0;
  let bracketDepth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") bracketDepth += 1;
    if (character === "]") bracketDepth -= 1;
    const isSeparator = separator === ","
      ? character === "," && bracketDepth === 0
      : /\s/.test(character) && bracketDepth === 0;
    if (!isSeparator) continue;
    const part = source.slice(start, index).trim();
    if (part) parts.push(part);
    if (separator === " ") {
      while (index + 1 < source.length && /\s/.test(source[index + 1])) index += 1;
    }
    start = index + 1;
  }
  const tail = source.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function matchesSelector(node, selector) {
  const parts = splitSelector(selector, " ");
  if (parts.length === 0 || !matchesSimpleSelector(node, parts.at(-1))) return false;
  let ancestor = node.parentElement;
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    while (ancestor && !matchesSimpleSelector(ancestor, parts[index])) {
      ancestor = ancestor.parentElement;
    }
    if (!ancestor) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}

function buildFixture(fileName, options = {}) {
  const fixturePath = path.join(path.dirname(__SCRIPT_PATH__), "fixtures", fileName);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const queries = [];
  function buildNode(spec, parent = null) {
    const attrs = { ...(spec.attrs ?? {}) };
    const node = {
      localName: spec.tag.toLowerCase(),
      tagName: spec.tag.toUpperCase(),
      parentElement: parent,
      children: [],
      textContent: spec.text ?? "",
      isConnected: true,
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? String(attrs[name]) : null;
      },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
      setAttribute(name, value) {
        attrs[name] = String(value);
        node[attributeNameToProperty(name)] = String(value);
        if (name.startsWith("data-")) {
          node.dataset[attributeNameToProperty(name.slice(5))] = String(value);
        }
      },
      removeAttribute(name) {
        delete attrs[name];
        delete node[attributeNameToProperty(name)];
        if (name.startsWith("data-")) {
          delete node.dataset[attributeNameToProperty(name.slice(5))];
        }
      },
      matches(selector) {
        return splitSelector(selector, ",").some((part) => matchesSelector(node, part));
      },
      closest(selector) {
        for (let cursor = node; cursor; cursor = cursor.parentElement) {
          if (cursor.matches(selector)) return cursor;
        }
        return null;
      },
      querySelectorAll(selector) { return query(node, selector, false); },
      querySelector(selector) { return query(node, selector, false)[0] ?? null; },
    };
    for (const [name, value] of Object.entries(attrs)) {
      node[attributeNameToProperty(name)] = String(value);
    }
    node.dataset = Object.fromEntries(
      Object.entries(attrs)
        .filter(([name]) => name.startsWith("data-"))
        .map(([name, value]) => [attributeNameToProperty(name.slice(5)), String(value)]),
    );
    node.children = (spec.children ?? []).map((child) => buildNode(child, node));
    if (!spec.text) node.textContent = node.children.map((child) => child.textContent).join(" ");
    return node;
  }
  function descendants(root, includeRoot) {
    const found = includeRoot ? [root] : [];
    for (const child of root.children) found.push(child, ...descendants(child, false));
    return found;
  }
  function query(root, selector, includeRoot) {
    queries.push(selector);
    if (options.throwWhen?.(selector)) throw new Error(`fixture query failed: ${selector}`);
    const selectors = splitSelector(selector, ",");
    return descendants(root, includeRoot).filter((node) =>
      selectors.some((part) => matchesSelector(node, part))
    );
  }
  const body = buildNode(fixture.tree);
  const document = {
    body,
    documentElement: body,
    querySelectorAll(selector) { return query(body, selector, true); },
    querySelector(selector) { return query(body, selector, true)[0] ?? null; },
  };
  return {
    fixture,
    queries,
    body,
    document,
    root: {
      document,
      location: { href: fixture.location.href, pathname: fixture.location.pathname },
      MutationObserver: class FixtureMutationObserver {
        observe() {}
        disconnect() {}
      },
      dispatchEvent() { return true; },
    },
  };
}

async function fixtureContract(fileName, expectedStatus) {
  const fake = buildFixture(fileName);
  const sidebarTag = fileName.includes("modern") ? "nav" : "aside";
  assert.equal(
    fake.document.querySelectorAll(`${sidebarTag} a[href]`).length,
    2,
    `${fileName} fixture engine evaluates a real descendant combinator`,
  );
  assert.equal(
    fake.document.querySelectorAll(`main a[href]`).length,
    fileName.includes("modern") ? 5 : 1,
    `${fileName} fixture engine scopes descendant queries to their ancestor`,
  );
  const runtime = createRuntimeCompatibility({
    root: fake.root,
    maxAttempts: 1,
    loadModule: async () => ({}),
  });
  const directCapabilities = await runtime.detectCapabilities();
  assert.equal(
    directCapabilities.dom.status,
    expectedStatus,
    `${fileName} is actively probed by detectCapabilities`,
  );
  assert.deepStrictEqual(directCapabilities.dom.features, {
    sessions: { status: expectedStatus },
    composer: { status: expectedStatus },
    threadMenu: { status: expectedStatus },
  });
  assert.equal(directCapabilities.sessionObservation.status, expectedStatus);
  assert.equal(directCapabilities.currentThreadResolution.status, expectedStatus);
  const sessions = runtime.dom.sessions();
  assert.equal(sessions.length, 2, `${fileName} exposes two sessions`);
  assert.deepStrictEqual(
    sessions.map((row) => runtime.dom.sessionRef(row)?.threadId),
    ["thread-current", "thread-other"],
  );
  assert.equal(runtime.dom.sessionRef(sessions[0])?.title, "Current sanitized session");
  assert.equal(runtime.resolveCurrentThread()?.threadId, "thread-current");
  const composer = runtime.dom.composer();
  assert.ok(composer, `${fileName} exposes a composer capability`);
  assert.equal(runtime.dom.isComposer(composer), true);
  const composerChild = composer.children?.[0];
  assert.ok(runtime.dom.closestComposer(composerChild || composer));
  assert.equal(runtime.dom.composerCandidates().length, 1);
  assert.deepStrictEqual(
    runtime.dom.composerCandidates().map((node) => node.getAttribute("data-fixture-case")),
    [null],
    "an unrelated contenteditable editor is not a composer candidate",
  );
  assert.equal(runtime.dom.threadMenus().length, 1);
  assert.equal(runtime.dom.menuItems(runtime.dom.threadMenus()[0]).length, 1);
  const capabilities = await runtime.detectCapabilities();
  assert.equal(capabilities.dom.status, expectedStatus);
  assert.deepStrictEqual(capabilities.dom.features, {
    sessions: { status: expectedStatus },
    composer: { status: expectedStatus },
    threadMenu: { status: expectedStatus },
  });
  assert.ok(fake.queries.length >= 3, "fixture contract performs real document queries");
  assert.ok(
    fake.queries.every((selector) => typeof selector === "string" && selector.length > 0),
    "adapter supplies each selector to querySelector/querySelectorAll",
  );
}

(async () => {
  await fixtureContract("runtime-dom-modern.json", "supported");
  await fixtureContract("runtime-dom-legacy.json", "degraded");

  const scoped = buildFixture("runtime-dom-modern.json");
  const scopedRuntime = createRuntimeCompatibility({
    root: scoped.root, maxAttempts: 1, loadModule: async () => ({}),
  });
  assert.deepStrictEqual(
    scopedRuntime.dom.sessions().map((row) => scopedRuntime.dom.sessionRef(row).threadId),
    ["thread-current", "thread-other"],
    "fallback session links are scoped to the sidebar and ignore content distractors",
  );

  const duplicateSource = buildFixture("runtime-dom-modern.json");
  const duplicateRow = duplicateSource.document.querySelector(
    '[data-app-action-sidebar-thread-id="thread-current"]',
  );
  scoped.document.querySelector('nav[aria-label="Threads"]').children.push(duplicateRow);
  const duplicateSessions = scopedRuntime.dom.sessions();
  const duplicateCurrentRows = duplicateSessions.filter(
    (row) => scopedRuntime.dom.sessionRef(row).threadId === "thread-current",
  );
  assert.equal(duplicateCurrentRows.length, 2, "same thread id keeps two distinct DOM rows");
  assert.notEqual(duplicateCurrentRows[0], duplicateCurrentRows[1], "rows retain node identity");

  const routeCases = buildFixture("runtime-dom-modern.json");
  const routeRuntime = createRuntimeCompatibility({ root: routeCases.root });
  const threadIdForCase = (name) => routeRuntime.dom.sessionRef(
    routeCases.document.querySelector(`[data-fixture-case="${name}"]`),
  ).threadId;
  assert.equal(threadIdForCase("generic-id-24"), "123456789012345678901234");
  assert.equal(threadIdForCase("generic-id-23"), "", "generic route ids require 24 characters");
  assert.equal(threadIdForCase("settings-route"), "", "settings is not a thread id");
  assert.equal(threadIdForCase("plugins-route"), "", "plugins is not a thread id");

  const markerFixture = buildFixture("runtime-dom-modern.json");
  const markerNav = markerFixture.document.querySelector('nav[aria-label="Threads"]');
  markerNav.children.reverse();
  const markerRuntime = createRuntimeCompatibility({ root: markerFixture.root });
  assert.equal(
    markerRuntime.resolveCurrentThread()?.threadId,
    "thread-current",
    "a semantic current marker child wins over an unrelated fallback active child",
  );
  markerFixture.document.querySelector('[aria-current="page"]').removeAttribute("aria-current");
  const noMarkerRuntime = createRuntimeCompatibility({
    root: buildFixture("runtime-dom-modern.json").root,
  });
  const noMarkerRows = noMarkerRuntime.dom.sessions();
  noMarkerRows.forEach((row) => {
    row.querySelector('[aria-current="page"]')?.removeAttribute("aria-current");
    row.querySelector('[aria-current="true"]')?.removeAttribute("aria-current");
    row.querySelector('[data-current="true"]')?.removeAttribute("data-current");
    row.querySelector('[data-state="active"]')?.removeAttribute("data-state");
  });
  assert.equal(
    noMarkerRuntime.resolveCurrentThread(),
    null,
    "opaque location and no semantic marker do not infer a current thread from visual children",
  );

  const genericMenuFixture = buildFixture("runtime-dom-modern.json");
  genericMenuFixture.document.querySelector('[role="menu"]').removeAttribute("aria-label");
  const genericMenuRuntime = createRuntimeCompatibility({
    root: genericMenuFixture.root, maxAttempts: 1, loadModule: async () => ({}),
  });
  assert.equal(genericMenuRuntime.dom.threadMenus().length, 1);
  assert.equal(
    (await genericMenuRuntime.detectCapabilities()).dom.features.threadMenu.status,
    "degraded",
    "a generic role menu is only a fallback",
  );
  const labeledMenuFixture = buildFixture("runtime-dom-modern.json");
  const labeledMenuRuntime = createRuntimeCompatibility({
    root: labeledMenuFixture.root, maxAttempts: 1, loadModule: async () => ({}),
  });
  assert.equal(labeledMenuRuntime.dom.threadMenus().length, 1);
  assert.equal(
    (await labeledMenuRuntime.detectCapabilities()).dom.features.threadMenu.status,
    "supported",
    "a thread-labeled role menu is semantic",
  );

  const mixedModern = buildFixture("runtime-dom-modern.json");
  const mixedLegacy = buildFixture("runtime-dom-legacy.json");
  const legacyMenu = mixedLegacy.body.children.find(
    (node) => node.hasAttribute("data-radix-popper-content-wrapper"),
  );
  mixedModern.body.children.push(legacyMenu);
  const mixedRuntime = createRuntimeCompatibility({
    root: mixedModern.root, maxAttempts: 1, loadModule: async () => ({}),
  });
  assert.equal(
    mixedRuntime.dom.threadMenus().length,
    2,
    "list queries preserve semantic and fallback menu implementations on a mixed page",
  );
  assert.equal(
    (await mixedRuntime.detectCapabilities()).dom.features.threadMenu.status,
    "degraded",
  );

  const nestedModern = buildFixture("runtime-dom-modern.json");
  const nestedLegacy = buildFixture("runtime-dom-legacy.json");
  const semanticMenu = nestedModern.body.children.find(
    (node) => node.getAttribute("role") === "menu",
  );
  nestedModern.body.children = nestedModern.body.children.filter((node) => node !== semanticMenu);
  const legacyWrapper = nestedLegacy.body.children.find(
    (node) => node.hasAttribute("data-radix-popper-content-wrapper"),
  );
  legacyWrapper.children.push(semanticMenu);
  nestedModern.body.children.push(legacyWrapper);
  const nestedRuntime = createRuntimeCompatibility({
    root: nestedModern.root, maxAttempts: 1, loadModule: async () => ({}),
  });
  assert.equal(
    nestedRuntime.dom.threadMenus().length,
    1,
    "a fallback wrapper and its semantic child represent one logical menu",
  );

  const missingComposer = buildFixture("runtime-dom-modern.json");
  missingComposer.body.children = missingComposer.body.children.filter(
    (node) => node.getAttribute("data-fixture-case") !== "modern-composer-surface",
  );
  const composerRuntime = createRuntimeCompatibility({
    root: missingComposer.root, maxAttempts: 1, loadModule: async () => ({}),
  });
  assert.deepStrictEqual((await composerRuntime.detectCapabilities()).dom.features, {
    sessions: { status: "supported" },
    composer: { status: "degraded" },
    threadMenu: { status: "supported" },
  });
  assert.equal(composerRuntime.dom.composer(), null);
  assert.equal(composerRuntime.dom.sessions().length, 2);
  assert.equal(composerRuntime.dom.threadMenus().length, 1);
  assert.deepStrictEqual((await composerRuntime.detectCapabilities()).dom.features, {
    sessions: { status: "supported" },
    composer: { status: "degraded" },
    threadMenu: { status: "supported" },
  });

  const missingMenu = buildFixture("runtime-dom-modern.json");
  missingMenu.body.children = missingMenu.body.children.filter(
    (node) => node.getAttribute("role") !== "menu",
  );
  const menuRuntime = createRuntimeCompatibility({
    root: missingMenu.root, maxAttempts: 1, loadModule: async () => ({}),
  });
  assert.deepStrictEqual((await menuRuntime.detectCapabilities()).dom.features, {
    sessions: { status: "supported" },
    composer: { status: "supported" },
    threadMenu: { status: "degraded" },
  });
  assert.equal(menuRuntime.dom.threadMenus().length, 0);
  assert.equal(menuRuntime.dom.sessions().length, 2);
  assert.equal(menuRuntime.dom.isComposer(menuRuntime.dom.composer()), true);
  assert.deepStrictEqual((await menuRuntime.detectCapabilities()).dom.features, {
    sessions: { status: "supported" },
    composer: { status: "supported" },
    threadMenu: { status: "degraded" },
  });

  const brokenSessions = buildFixture("runtime-dom-modern.json", {
    throwWhen: (selector) => selector.includes("sidebar-thread-id")
      || selector.includes("data-thread-id") || selector.includes("data-session-id")
      || selector.includes("history-item") || selector.includes("href*="),
  });
  const brokenSessionsRuntime = createRuntimeCompatibility({
    root: brokenSessions.root, maxAttempts: 1, loadModule: async () => ({}),
  });
  const brokenSessionsCapabilities = await brokenSessionsRuntime.detectCapabilities();
  assert.equal(brokenSessionsCapabilities.dom.features.sessions.status, "unsupported");
  assert.equal(brokenSessionsCapabilities.sessionObservation.status, "unsupported");
  assert.equal(brokenSessionsCapabilities.currentThreadResolution.status, "unsupported");
  assert.equal(brokenSessionsCapabilities.dom.features.composer.status, "supported");
  assert.equal(brokenSessionsCapabilities.dom.features.threadMenu.status, "supported");

  const queryFailure = buildFixture("runtime-dom-modern.json", {
    throwWhen: (selector) => selector.includes("composer")
      || selector.includes("contenteditable") || selector.includes("message"),
  });
  const queryFailureRuntime = createRuntimeCompatibility({
    root: queryFailure.root, maxAttempts: 1, loadModule: async () => ({}),
  });
  assert.equal(queryFailureRuntime.dom.composer(), null, "query failure is contained");
  assert.equal(queryFailureRuntime.dom.sessions().length, 2, "other DOM features survive");
  assert.equal(
    (await queryFailureRuntime.detectCapabilities()).dom.features.composer.status,
    "unsupported",
  );
})();
"#,
    );
}

#[test]
fn runtime_dom_query_breakers_are_consecutive_bounded_and_feature_scoped() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

function queryRoot({ failFirstComposerSelectorOnly = false } = {}) {
  let composerQueries = 0;
  const session = {
    textContent: "Session", getAttribute(name) {
      return name === "data-app-action-sidebar-thread-id" ? "thread-safe" : null;
    }, matches() { return false; }, querySelector() { return null; }, querySelectorAll() { return []; },
  };
  const composer = {
    role: "composer", getAttribute(name) {
      if (name === "role") return "composer";
      if (name === "aria-label") return "Write a message";
      return null;
    },
    matches(selector) { return selector.includes('form[aria-label*="message" i]'); },
    closest(selector) { return this.matches(selector) ? this : null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
  };
  const menu = {
    getAttribute(name) { return name === "role" ? "menu" : null; },
    matches(selector) { return selector === '[role="menu"]'; },
    querySelector() { return null; }, querySelectorAll() { return []; },
  };
  const document = {
    body: {}, documentElement: {},
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      if (selector.includes("composer") || selector.includes("contenteditable") || selector.includes("message")) {
        composerQueries += 1;
        if (!failFirstComposerSelectorOnly || selector.includes('[data-testid="composer"]')) {
          throw new Error("composer query renamed upstream");
        }
        return selector.includes("message") ? [composer] : [];
      }
      if (selector.includes("sidebar-thread-id")) return [session];
      if (selector === '[role="menu"]') return [menu];
      return [];
    },
  };
  return { root: { document, location: { href: "https://example.invalid/thread/thread-safe" } }, getComposerQueries: () => composerQueries };
}

(async () => {
  const diagnostics = [];
  const broken = queryRoot();
  const runtime = createRuntimeCompatibility({
    root: broken.root,
    failureThreshold: 3,
    maxAttempts: 1,
    loadModule: async () => ({}),
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  });
  for (let index = 0; index < 8; index += 1) runtime.dom.composer();
  const queriesAtBreaker = broken.getComposerQueries();
  assert.ok(queriesAtBreaker > 0);
  for (let index = 0; index < 8; index += 1) runtime.dom.composer();
  assert.equal(broken.getComposerQueries(), queriesAtBreaker, "disabled feature stops querying");
  assert.equal(runtime.dom.featureStatus("composer"), "unsupported");
  assert.equal(
    diagnostics.filter(([code]) => code === "runtime_dom_feature_disabled").length,
    1,
  );
  assert.equal(runtime.dom.sessions().length, 1, "sessions remain available");
  assert.equal(runtime.dom.threadMenus().length, 1, "menus remain available");

  const recoverable = queryRoot({ failFirstComposerSelectorOnly: true });
  const recoverableRuntime = createRuntimeCompatibility({
    root: recoverable.root, failureThreshold: 2, maxAttempts: 1, loadModule: async () => ({}),
  });
  assert.equal(recoverableRuntime.dom.composer()?.role, "composer");
  assert.equal(recoverableRuntime.dom.featureStatus("composer"), "supported");
  assert.equal(recoverableRuntime.dom.composer()?.role, "composer");
})();
"#,
    );
}

#[test]
fn runtime_dom_feature_reset_reopens_only_the_requested_query_circuit() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

let failComposer = true;
let composerQueries = 0;
const composer = {
  role: "composer",
  getAttribute(name) {
    if (name === "role") return "composer";
    if (name === "aria-label") return "Write a message";
    return null;
  },
  matches(selector) { return selector.includes('form[aria-label*="message" i]'); },
  closest(selector) { return this.matches(selector) ? this : null; },
  querySelector() { return null; }, querySelectorAll() { return []; },
};
const document = {
  body: {}, documentElement: {},
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
  querySelectorAll(selector) {
    if (selector.includes("composer") || selector.includes("contenteditable") || selector.includes("message")) {
      composerQueries += 1;
      if (failComposer) throw new Error("temporary upstream mismatch");
      return selector.includes("message") ? [composer] : [];
    }
    return [];
  },
};
const root = { document };
const first = createRuntimeCompatibility({ root, failureThreshold: 2 });
assert.equal(first.dom.composer(), null);
assert.equal(first.dom.composer(), null);
const atOpen = composerQueries;
failComposer = false;
assert.equal(first.dom.composer(), null, "open circuit stays fail-closed within one injection");
assert.equal(composerQueries, atOpen);
assert.equal(first.dom.resetFeature("composer"), true);
assert.equal(first.dom.composer()?.role, "composer", "explicit reinjection reset recovers queries");
assert.ok(composerQueries > atOpen);

first.dom.resetFeature("unknown-feature");
assert.equal(first.dom.featureStatus("unknown-feature"), "unsupported");
"#,
    );
}

#[test]
fn runtime_dom_observers_are_root_scoped_replaceable_and_failure_isolated() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

class FakeMutationObserver {
  static instances = [];
  constructor(callback) {
    this.callback = callback;
    this.active = false;
    this.disconnectCalls = 0;
    FakeMutationObserver.instances.push(this);
  }
  observe(target, options) {
    this.target = target;
    this.options = options;
    this.active = true;
  }
  disconnect() {
    this.active = false;
    this.disconnectCalls += 1;
  }
  trigger(records = [{ type: "childList" }]) {
    if (this.active) this.callback(records, this);
  }
}

(async () => {
  const diagnostics = [];
  const root = {
    document: { body: { id: "body" } },
    MutationObserver: FakeMutationObserver,
    dispatchEvent() { return true; },
  };
  const environment = {
    root, maxAttempts: 1, loadModule: async () => ({}),
    diagnostic: (code, detail) => diagnostics.push([code, detail]),
  };
  const firstRuntime = createRuntimeCompatibility(environment);
  let staleCalls = 0;
  const firstObservation = firstRuntime.dom.observe(
    "session-scan",
    () => { staleCalls += 1; },
  );
  assert.equal(firstObservation.status, "supported");
  assert.equal(firstObservation.active, true);
  const staleObserver = FakeMutationObserver.instances.at(-1);
  let replacementCalls = 0;
  firstRuntime.dom.observe("session-scan", () => { replacementCalls += 1; });
  const replacementObserver = FakeMutationObserver.instances.at(-1);
  assert.equal(staleObserver.active, false, "duplicate registration disconnects the old observer");
  assert.equal(staleObserver.disconnectCalls, 1);
  staleObserver.trigger();
  replacementObserver.trigger();
  assert.equal(staleCalls, 0);
  assert.equal(replacementCalls, 1);

  const secondRuntime = createRuntimeCompatibility(environment);
  let recreatedCalls = 0;
  secondRuntime.dom.observe("session-scan", () => { recreatedCalls += 1; });
  const recreatedObserver = FakeMutationObserver.instances.at(-1);
  assert.equal(replacementObserver.active, false, "runtime recreation shares root observer state");
  recreatedObserver.trigger();
  assert.equal(replacementCalls, 1);
  assert.equal(recreatedCalls, 1);

  let brokenCalls = 0;
  secondRuntime.dom.observe("broken-view", () => {
    brokenCalls += 1;
    throw new Error("expected fixture callback failure");
  }, { failureThreshold: 2 });
  const brokenObserver = FakeMutationObserver.instances.at(-1);
  let healthyCalls = 0;
  secondRuntime.dom.observe("healthy-view", () => { healthyCalls += 1; });
  const healthyObserver = FakeMutationObserver.instances.at(-1);
  for (let index = 0; index < 3; index += 1) {
    assert.doesNotThrow(() => brokenObserver.trigger());
    healthyObserver.trigger();
  }
  assert.equal(brokenCalls, 2, "feature breaker stops callbacks at its finite threshold");
  assert.equal(brokenObserver.active, false);
  assert.equal(healthyCalls, 3, "a broken observer cannot disable another feature");
  assert.equal(healthyObserver.active, true);
  assert.equal(
    diagnostics.filter(([code]) => code === "runtime_dom_observer_disabled").length,
    1,
    "observer breaker emits one explicit diagnosis",
  );
  assert.doesNotThrow(() => secondRuntime.dom.disconnect("healthy-view"));
  assert.equal(healthyObserver.active, false);
  assert.doesNotThrow(
    () => secondRuntime.dom.disconnect("healthy-view"),
    "disconnect is idempotent",
  );

  const missingDiagnostics = [];
  const missingRuntime = createRuntimeCompatibility({
    root: { document: { body: {} }, dispatchEvent() { return true; } },
    maxAttempts: 1,
    loadModule: async () => ({}),
    diagnostic: (code, detail) => missingDiagnostics.push([code, detail]),
  });
  const missingOne = missingRuntime.dom.observe("missing-one", () => {});
  const missingTwo = missingRuntime.dom.observe("missing-two", () => {});
  assert.equal(missingOne.status, "unsupported");
  assert.equal(missingOne.active, false);
  assert.equal(missingTwo.status, "unsupported");
  assert.equal(missingTwo.active, false);
  assert.equal(
    missingDiagnostics.filter(([code]) => code === "runtime_dom_observer_unsupported").length,
    1,
    "missing MutationObserver is diagnosed once per root",
  );
  const missingCapabilities = await missingRuntime.detectCapabilities();
  assert.deepStrictEqual(missingCapabilities.dom.features.observer, { status: "unsupported" });
})();
"#,
    );
}

#[test]
fn runtime_dom_polling_stops_early_is_bounded_and_replaces_duplicate_work() {
    run_runtime_harness(
        r#"
const assert = require("node:assert/strict");
const { createRuntimeCompatibility } = require(__SCRIPT_PATH__);

function scheduler() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout(callback, milliseconds) {
      const id = nextId++;
      pending.set(id, { callback, milliseconds });
      return id;
    },
    clearTimeout(id) { pending.delete(id); },
    flushOne() {
      const entry = pending.entries().next().value;
      if (!entry) return false;
      const [id, task] = entry;
      pending.delete(id);
      task.callback();
      return true;
    },
    flushAll(limit = 100) {
      let count = 0;
      while (this.flushOne()) {
        count += 1;
        if (count > limit) throw new Error("poll scheduled unbounded work");
      }
      return count;
    },
    get size() { return pending.size; },
    intervals() { return [...pending.values()].map((task) => task.milliseconds); },
  };
}

const timer = scheduler();
const root = { document: { body: {} }, dispatchEvent() { return true; } };
const environment = { root, timer, maxAttempts: 1, loadModule: async () => ({}) };
const runtime = createRuntimeCompatibility(environment);

let boundedAttempts = 0;
const boundedPoll = runtime.dom.poll(
  "bounded",
  () => { boundedAttempts += 1; return false; },
  { intervalMs: 350, maxAttempts: 3 },
);
assert.equal(boundedPoll.status, "supported");
assert.equal(boundedPoll.active, true);
assert.ok(boundedAttempts <= 1, "registration performs at most one eager attempt");
assert.deepStrictEqual(timer.intervals(), [350]);
timer.flushAll();
assert.equal(boundedAttempts, 3, "maxAttempts is an inclusive finite bound");
assert.equal(timer.size, 0);

let earlyAttempts = 0;
runtime.dom.poll("early", () => {
  earlyAttempts += 1;
  return earlyAttempts === 2;
}, { intervalMs: 10, maxAttempts: 9 });
timer.flushAll();
assert.equal(earlyAttempts, 2, "truthy callback result settles polling early");
assert.equal(timer.size, 0);

let staleAttempts = 0;
runtime.dom.poll("replace-me", () => { staleAttempts += 1; return false; }, {
  intervalMs: 5, maxAttempts: 5,
});
let replacementAttempts = 0;
runtime.dom.poll("replace-me", () => { replacementAttempts += 1; return false; }, {
  intervalMs: 7, maxAttempts: 2,
});
assert.ok(staleAttempts <= 1);
assert.ok(replacementAttempts <= 1);
const staleBeforeFlush = staleAttempts;
assert.deepStrictEqual(timer.intervals(), [7], "duplicate feature replaces its pending timer");
timer.flushAll();
assert.equal(staleAttempts, staleBeforeFlush, "replaced poll never runs again");
assert.equal(replacementAttempts, 2);

const recreated = createRuntimeCompatibility(environment);
let oldRootCalls = 0;
runtime.dom.poll("root-shared", () => { oldRootCalls += 1; return false; }, {
  intervalMs: 11, maxAttempts: 4,
});
let newRootCalls = 0;
recreated.dom.poll("root-shared", () => { newRootCalls += 1; return false; }, {
  intervalMs: 13, maxAttempts: 2,
});
const oldRootBeforeFlush = oldRootCalls;
assert.deepStrictEqual(timer.intervals(), [13], "recreated runtime shares root poll registry");
timer.flushAll();
assert.equal(oldRootCalls, oldRootBeforeFlush);
assert.equal(newRootCalls, 2);
"#,
    );
}
