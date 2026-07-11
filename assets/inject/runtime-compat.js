(function installRuntimeCompatibility(root, factory) {
  "use strict";

  const exported = factory();
  const commonJs = typeof module === "object" && module && module.exports;
  if (commonJs) {
    module.exports = exported;
  }
  let browserRoot = false;
  try {
    browserRoot = !!root && typeof root === "object" && root.window === root;
  } catch {
    browserRoot = false;
  }
  if (browserRoot) {
    try {
      root.ChatGPTPlusRuntimeCompat = exported;
    } catch {
    }
    try {
      const existing = root.__chatgptPlusRuntimeCompatibility;
      if (!exported.isCompatibleRuntimeInstance(existing)) {
        root.__chatgptPlusRuntimeCompatibility = exported.createRuntimeCompatibility({ root });
      }
    } catch {
    }
  }
})(typeof globalThis === "object" ? globalThis : this, function runtimeCompatibilityModule() {
  "use strict";

  const RuntimeApiVersion = "1.2.0";
  const RuntimeInstanceBrand =
    typeof Symbol === "function" && typeof Symbol.for === "function"
      ? Symbol.for("chatgpt-plus.runtime-compat.instance")
      : "__chatgptPlusRuntimeCompatibilityInstance";
  const RuntimeInterfaceMethods = Object.freeze([
    "normalizeRequest",
    "replaceRequestParams",
    "detectCapabilities",
    "installRequestInterceptor",
    "observeSessions",
    "resolveCurrentThread",
  ]);

  const InternalRequestKind = Object.freeze({
    StartThread: "StartThread",
    ResumeThread: "ResumeThread",
    StartTurn: "StartTurn",
    ListModels: "ListModels",
    CreateWorktree: "CreateWorktree",
  });

  const SupportStatus = Object.freeze({
    Supported: "supported",
    Degraded: "degraded",
    Unsupported: "unsupported",
  });

  const SurfaceKind = Object.freeze({
    Workspace: "workspace",
    Auxiliary: "auxiliary",
    Unknown: "unknown",
  });

  // Upstream auxiliary window vocabulary belongs here rather than in feature
  // code. These surfaces share the app shell but must never receive workspace
  // controls such as the ChatGPT++ menu.
  const UPSTREAM_AUXILIARY_ROUTES = Object.freeze([
    "/avatar-overlay",
  ]);

  // This is the only place where upstream DOM vocabulary is allowed.  Callers
  // consume feature names and nodes; selectors remain an adapter detail.
  const DOM_SELECTORS = Object.freeze({
    sessions: Object.freeze({
      semantic: Object.freeze([
        "[data-app-action-sidebar-thread-id]",
        '[role="navigation"] [data-thread-id]',
        '[role="navigation"] [data-session-id]',
        "nav [data-session-id]",
        "aside [data-session-id]",
      ]),
      fallback: Object.freeze([
        'nav a[href*="/session/"]',
        'nav a[href*="/conversation/"]',
        'nav a[href*="/thread/"]',
        'aside a[href*="/session/"]',
        'aside a[href*="/conversation/"]',
        'aside a[href*="/thread/"]',
        '[role="navigation"] a[href*="/session/"]',
        '[role="navigation"] a[href*="/conversation/"]',
        '[role="navigation"] a[href*="/thread/"]',
        '[data-testid^="history-item"]',
      ]),
    }),
    sessionTitle: Object.freeze({
      semantic: Object.freeze(["[data-thread-title]", '[data-testid="thread-title"]']),
      fallback: Object.freeze([".truncate.select-none", ".truncate.text-base"]),
    }),
    currentMarker: Object.freeze({
      semantic: Object.freeze([
        '[aria-current="page"]',
        '[aria-current="true"]',
        '[data-state="active"]',
        '[data-current="true"]',
      ]),
      fallback: Object.freeze([]),
    }),
    composer: Object.freeze({
      semantic: Object.freeze([
        '[data-testid="composer"]',
        'form[aria-label="Message composer"]',
        'form[aria-label*="message" i]',
        '[contenteditable="true"][data-virtualkeyboard="true"]',
      ]),
      fallback: Object.freeze([".composer-footer", "[class*='composer'][class*='footer']"]),
    }),
    threadMenu: Object.freeze({
      semantic: Object.freeze([
        '[role="menu"][aria-label*="thread" i]',
        '[data-testid="thread-menu"]',
      ]),
      fallback: Object.freeze([
        '[role="menu"]',
        "[data-radix-menu-content]",
        "[data-radix-popper-content-wrapper]",
        "[cmdk-list]",
      ]),
    }),
    menuItems: Object.freeze({
      semantic: Object.freeze(['[role="menuitem"]', '[data-testid="thread-menu-item"]']),
      fallback: Object.freeze(["[data-radix-collection-item]", "[cmdk-item]"]),
    }),
  });
  const DOM_COMPOSER_CONTAINERS = Object.freeze({
    semantic: Object.freeze([
      '[data-testid="composer"]',
      'form[aria-label*="message" i]',
      '[contenteditable="true"][data-virtualkeyboard="true"]',
    ]),
    fallback: DOM_SELECTORS.composer.fallback,
  });

  const SourceAdapter = Object.freeze({
    NestedParams: "NestedParams",
    DirectParams: "DirectParams",
    HostWrapperParams: "HostWrapperParams",
    InlinePayload: "InlinePayload",
    NestedPayload: "NestedPayload",
  });

  const UpstreamEnvelope = Object.freeze({
    NestedRpc: "mcp-request",
    WorkerRpc: "worker-request",
    NestedThreadPrewarm: "thread-prewarm-start",
    DirectRpc: "send-cli-request-for-host",
    DirectThreadPrewarm: "prewarm-thread-start-for-host",
    InlineThreadStart: "start-conversation",
    InlineHostThreadStart: "start-thread-for-host",
    DirectTurnStart: "start-turn-for-host",
    NestedWorktreeCreate: "pending-worktree-create",
  });

  const UpstreamMethodKind = Object.freeze(
    Object.assign(Object.create(null), {
      "thread/start": InternalRequestKind.StartThread,
      "thread/resume": InternalRequestKind.ResumeThread,
      "turn/start": InternalRequestKind.StartTurn,
      "model/list": InternalRequestKind.ListModels,
      "list-models-for-host": InternalRequestKind.ListModels,
    }),
  );
  const SupportedUpstreamEnvelopes = new Set(Object.values(UpstreamEnvelope));

  function isObject(value) {
    if (!value || typeof value !== "object") return false;
    try {
      return !Array.isArray(value);
    } catch {
      return false;
    }
  }

  const OmitSanitizedValue = Symbol("omit-sanitized-value");
  const SanitizerLimits = Object.freeze({ maxDepth: 32, maxNodes: 512, maxKeys: 4096 });

  function isPlainRecord(value) {
    if (!value || typeof value !== "object") return false;
    try {
      if (Array.isArray(value)) return false;
      const prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch {
      return false;
    }
  }

  function defineSanitizedValue(target, key, value) {
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  function sanitizeJsonLike(value, context, depth = 0) {
    const valueType = typeof value;
    if (value === null || valueType === "string" || valueType === "number" ||
        valueType === "boolean" || valueType === "bigint" || valueType === "undefined") {
      return value;
    }
    if (valueType !== "object") {
      context.lossless = false;
      return OmitSanitizedValue;
    }
    if (context.seen.has(value)) return context.seen.get(value);
    if (depth >= context.maxDepth || context.nodes >= context.maxNodes) {
      context.lossless = false;
      return OmitSanitizedValue;
    }

    let prototype;
    let arrayValue;
    try {
      prototype = Object.getPrototypeOf(value);
      arrayValue = Array.isArray(value);
    } catch {
      context.lossless = false;
      return OmitSanitizedValue;
    }
    if (!arrayValue && prototype === Date.prototype) {
      try {
        const date = new Date(Date.prototype.getTime.call(value));
        context.seen.set(value, date);
        context.nodes += 1;
        return date;
      } catch {
        context.lossless = false;
        return OmitSanitizedValue;
      }
    }
    if (!arrayValue && prototype !== Object.prototype && prototype !== null) {
      context.lossless = false;
      return OmitSanitizedValue;
    }

    const clone = arrayValue ? [] : prototype === null ? Object.create(null) : {};
    context.seen.set(value, clone);
    context.nodes += 1;
    let keys;
    try {
      keys = Object.keys(value);
    } catch {
      context.lossless = false;
      return clone;
    }
    for (const key of keys) {
      if (context.keys >= context.maxKeys) {
        context.lossless = false;
        break;
      }
      context.keys += 1;
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, key);
      } catch {
        context.lossless = false;
        continue;
      }
      if (!descriptor || !("value" in descriptor)) {
        context.lossless = false;
        continue;
      }
      const sanitized = sanitizeJsonLike(descriptor.value, context, depth + 1);
      if (sanitized === OmitSanitizedValue) continue;
      if (!defineSanitizedValue(clone, key, sanitized)) context.lossless = false;
    }
    return clone;
  }

  function sanitizeParams(value) {
    if (value === undefined || value === null) return { lossless: true, value: {} };
    if (!isPlainRecord(value)) return { lossless: false, value: {} };
    const context = {
      ...SanitizerLimits,
      keys: 0,
      lossless: true,
      nodes: 0,
      seen: new WeakMap(),
    };
    const sanitized = sanitizeJsonLike(value, context);
    return {
      lossless: context.lossless && isPlainRecord(sanitized),
      value: isPlainRecord(sanitized) ? sanitized : {},
    };
  }

  function upstreamRequestKind(method) {
    if (typeof method !== "string") return null;
    return Object.prototype.hasOwnProperty.call(UpstreamMethodKind, method)
      ? UpstreamMethodKind[method]
      : null;
  }

  function normalizedRequest(kind, params, sourceAdapter, raw) {
    let threadId = null;
    if (kind === InternalRequestKind.StartThread) {
      threadId = typeof params.threadId === "string" ? params.threadId : null;
    } else if (
      kind === InternalRequestKind.ResumeThread ||
      kind === InternalRequestKind.StartTurn
    ) {
      threadId =
        typeof params.threadId === "string"
          ? params.threadId
          : typeof params.conversationId === "string"
            ? params.conversationId
            : typeof raw?.conversationId === "string"
              ? raw.conversationId
              : null;
    }
    return { kind, params, threadId, sourceAdapter };
  }

  const BundleAdapter = Object.freeze({
    name: "bundle-dispatcher",
    moduleHint: "setting-storage-",
  });
  const WindowEventAdapter = Object.freeze({
    name: "window-event",
    messageEvent: "codex-message-from-view",
  });
  const rootStateKey =
    typeof Symbol === "function" && typeof Symbol.for === "function"
      ? Symbol.for("chatgpt-plus.runtime-compat.state.v1")
      : "__chatgptPlusRuntimeCompatibilityStateV1";
  const registryKey =
    typeof Symbol === "function" && typeof Symbol.for === "function"
      ? Symbol.for("chatgpt-plus.runtime-compat.registry.v1")
      : "__chatgptPlusRuntimeCompatibilityRegistryV1";
  const moduleRootStateFallback = new WeakMap();

  function sharedRootStateRegistry() {
    if (typeof globalThis !== "object" || !globalThis) return moduleRootStateFallback;
    try {
      const existing = globalThis[registryKey];
      if (existing?.rootStates && callable(existing.rootStates.get)) {
        return existing.rootStates;
      }
      const rootStates = new WeakMap();
      Object.defineProperty(globalThis, registryKey, {
        configurable: false,
        enumerable: false,
        value: { rootStates },
        writable: false,
      });
      return rootStates;
    } catch {
      return moduleRootStateFallback;
    }
  }

  const rootStateFallback = sharedRootStateRegistry();

  function callable(value) {
    return typeof value === "function";
  }

  function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
  }

  function cappedPositiveInteger(value, fallback, maximum) {
    return Math.min(positiveInteger(value, fallback), maximum);
  }

  function hasOwn(value, key) {
    try {
      return Object.prototype.hasOwnProperty.call(value, key);
    } catch {
      return false;
    }
  }

  function runtimeRoot(environment) {
    if (isObject(environment.root) || callable(environment.root)) return environment.root;
    if (isObject(environment.window) || callable(environment.window)) return environment.window;
    if (typeof globalThis === "object" && globalThis) return globalThis;
    return {};
  }

  function environmentTimer(environment) {
    const timer = isObject(environment.timer) ? environment.timer : environment;
    if (callable(timer.setTimeout) && callable(timer.clearTimeout)) {
      return {
        clearTimeout: timer.clearTimeout.bind(timer),
        custom: true,
        setTimeout: timer.setTimeout.bind(timer),
      };
    }
    const globalSetTimeout = typeof setTimeout === "function" ? setTimeout : null;
    const globalClearTimeout = typeof clearTimeout === "function" ? clearTimeout : null;
    if (!globalSetTimeout || !globalClearTimeout) {
      return { clearTimeout: null, custom: false, setTimeout: null };
    }
    return {
      clearTimeout: globalClearTimeout,
      custom: false,
      setTimeout: globalSetTimeout,
    };
  }

  function createState(root, environment) {
    const timer = environmentTimer(environment);
    return {
      root,
      loadModule: callable(environment.loadModule) ? environment.loadModule : null,
      diagnostic: callable(environment.diagnostic) ? environment.diagnostic : null,
      createEvent: callable(environment.createEvent) ? environment.createEvent : null,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
      customTimer: timer.custom,
      MutationObserver: callable(environment.MutationObserver)
        ? environment.MutationObserver
        : callable(root?.MutationObserver)
          ? root.MutationObserver
          : null,
      timeoutMs: positiveInteger(environment.timeoutMs, 1500),
      maxAttempts: positiveInteger(environment.maxAttempts, 3),
      defaultFailureThreshold: positiveInteger(environment.failureThreshold, 3),
      probeMaxDepth: cappedPositiveInteger(environment.probeMaxDepth, 8, 16),
      probeMaxKeys: cappedPositiveInteger(environment.probeMaxKeys, 4096, 8192),
      probeMaxNodes: cappedPositiveInteger(environment.probeMaxNodes, 256, 1024),
      configuredScalars: {
        timeoutMs: hasOwn(environment, "timeoutMs"),
        maxAttempts: hasOwn(environment, "maxAttempts"),
        failureThreshold: hasOwn(environment, "failureThreshold"),
        probeMaxDepth: hasOwn(environment, "probeMaxDepth"),
        probeMaxKeys: hasOwn(environment, "probeMaxKeys"),
        probeMaxNodes: hasOwn(environment, "probeMaxNodes"),
      },
      diagnostics: new Set(),
      features: new Map(),
      detectionPromise: null,
      detectionComplete: false,
      adapter: null,
      dispatcher: null,
      windowEventVerified: false,
      installPromise: null,
      installed: false,
      installationTerminal: false,
      installResult: null,
      domFeatureStatus: new Map(),
      domQueryFeatures: new Map(),
      domObservers: new Map(),
      domPolls: new Map(),
      domSchemaVersion: 2,
    };
  }

  function supplementStateBeforeDetection(state, environment) {
    if (state.detectionPromise || state.detectionComplete) return;
    if (!isObject(state.configuredScalars)) {
      state.configuredScalars = {
        timeoutMs: true,
        maxAttempts: true,
        failureThreshold: true,
        probeMaxDepth: true,
        probeMaxKeys: true,
        probeMaxNodes: true,
      };
    }
    if (!state.loadModule && callable(environment.loadModule)) {
      state.loadModule = environment.loadModule;
    }
    if (!state.diagnostic && callable(environment.diagnostic)) {
      state.diagnostic = environment.diagnostic;
    }
    if (!state.createEvent && callable(environment.createEvent)) {
      state.createEvent = environment.createEvent;
    }
    if (!state.MutationObserver && callable(environment.MutationObserver)) {
      state.MutationObserver = environment.MutationObserver;
    }
    if (!state.customTimer) {
      const timer = environmentTimer(environment);
      if (timer.custom) {
        state.setTimeout = timer.setTimeout;
        state.clearTimeout = timer.clearTimeout;
        state.customTimer = true;
      }
    }
    const configure = (environmentKey, stateKey, normalize) => {
      if (state.configuredScalars[environmentKey] || !hasOwn(environment, environmentKey)) return;
      state[stateKey] = normalize(environment[environmentKey]);
      state.configuredScalars[environmentKey] = true;
    };
    configure("timeoutMs", "timeoutMs", (value) => positiveInteger(value, 1500));
    configure("maxAttempts", "maxAttempts", (value) => positiveInteger(value, 3));
    configure("failureThreshold", "defaultFailureThreshold", (value) =>
      positiveInteger(value, 3));
    configure("probeMaxDepth", "probeMaxDepth", (value) =>
      cappedPositiveInteger(value, 8, 16));
    configure("probeMaxKeys", "probeMaxKeys", (value) =>
      cappedPositiveInteger(value, 4096, 8192));
    configure("probeMaxNodes", "probeMaxNodes", (value) =>
      cappedPositiveInteger(value, 256, 1024));
  }

  function hydrateSharedState(state, root, environment) {
    if (state.domSchemaVersion !== 2) {
      state.domFeatureStatus = new Map();
      state.domQueryFeatures = new Map();
      state.domSchemaVersion = 2;
    } else {
      if (!(state.domFeatureStatus instanceof Map)) state.domFeatureStatus = new Map();
      if (!(state.domQueryFeatures instanceof Map)) state.domQueryFeatures = new Map();
    }
    if (!(state.domObservers instanceof Map)) state.domObservers = new Map();
    if (!(state.domPolls instanceof Map)) state.domPolls = new Map();
    if (!state.MutationObserver) {
      state.MutationObserver = callable(environment.MutationObserver)
        ? environment.MutationObserver
        : callable(root?.MutationObserver)
          ? root.MutationObserver
          : null;
    }
    return state;
  }

  function stateFor(root, environment) {
    let state;
    try {
      state = root[rootStateKey];
    } catch {
      state = null;
    }
    if (state && state.__chatgptPlusRuntimeCompatibilityState === true) {
      hydrateSharedState(state, root, environment);
      supplementStateBeforeDetection(state, environment);
      return state;
    }
    state = rootStateFallback.get(root);
    if (state) {
      hydrateSharedState(state, root, environment);
      supplementStateBeforeDetection(state, environment);
      return state;
    }

    state = createState(root, environment);
    Object.defineProperty(state, "__chatgptPlusRuntimeCompatibilityState", {
      value: true,
    });
    try {
      Object.defineProperty(root, rootStateKey, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: state,
      });
    } catch {
      rootStateFallback.set(root, state);
    }
    return state;
  }

  function diagnoseOnce(state, code, detail, scope = "") {
    const diagnosticKey = `${code}\u0000${scope}`;
    if (state.diagnostics.has(diagnosticKey)) return;
    state.diagnostics.add(diagnosticKey);
    try {
      state.diagnostic?.(code, detail);
    } catch {
      // Diagnostics must never become a runtime compatibility failure.
    }
  }

  function safeErrorText(value, fallback) {
    if (typeof value === "string") return value.slice(0, 500);
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      try {
        return String(value).slice(0, 500);
      } catch {
        return fallback;
      }
    }
    return fallback;
  }

  function summarizeError(thrown) {
    let name;
    let message;
    try {
      name = thrown?.name;
    } catch {
      name = null;
    }
    try {
      message = thrown?.message;
    } catch {
      message = null;
    }
    if (typeof thrown === "string" && !message) message = thrown;
    return {
      errorName: safeErrorText(name, "HandlerError"),
      errorMessage: safeErrorText(message, "handler failed with an opaque value"),
    };
  }

  function recordFeatureFailure(state, featureId, feature, thrown) {
    feature.failures += 1;
    if (feature.failures < feature.failureThreshold) return;
    feature.active = false;
    diagnoseOnce(
      state,
      "runtime_handler_disabled",
      {
        featureId,
        failures: feature.failures,
        ...summarizeError(thrown),
      },
      featureId,
    );
  }

  function capabilitySnapshot(state) {
    const capabilityDocument = domDocument(state);
    if (capabilityDocument && callable(capabilityDocument.querySelectorAll)) {
      queryDomFeature(state, "sessions", capabilityDocument);
      queryDomFeature(state, "composer", capabilityDocument);
      queryDomFeature(state, "threadMenu", capabilityDocument);
    }
    let status = SupportStatus.Unsupported;
    let adapter = null;
    if (state.adapter === BundleAdapter.name) {
      status = SupportStatus.Supported;
      adapter = BundleAdapter.name;
    } else if (state.adapter === WindowEventAdapter.name) {
      status = state.windowEventVerified ? SupportStatus.Supported : SupportStatus.Degraded;
      adapter = WindowEventAdapter.name;
    }
    const domFeatures = {};
    for (const feature of ["sessions", "composer", "threadMenu"]) {
      domFeatures[feature] = {
        status: state.domFeatureStatus.get(feature) || SupportStatus.Degraded,
      };
    }
    if (state.domFeatureStatus.has("observer")) {
      domFeatures.observer = { status: state.domFeatureStatus.get("observer") };
    }
    const hasDocument = !!state.root?.document &&
      callable(state.root.document.querySelectorAll);
    const sessionsStatus = hasDocument
      ? state.domFeatureStatus.get("sessions") || SupportStatus.Degraded
      : SupportStatus.Unsupported;
    const observationStatus = !hasDocument || !callable(state.MutationObserver)
      || sessionsStatus === SupportStatus.Unsupported
      ? SupportStatus.Unsupported
      : sessionsStatus === SupportStatus.Degraded
        ? SupportStatus.Degraded
        : SupportStatus.Supported;
    return {
      status,
      requestInterceptor: { status, adapter },
      sessionObservation: {
        status: observationStatus,
      },
      currentThreadResolution: {
        status: sessionsStatus,
      },
      dom: hasDocument || state.domFeatureStatus.has("observer")
        ? {
            status: hasDocument
              ? Object.values(domFeatures).every((feature) =>
                feature.status === SupportStatus.Supported)
                ? SupportStatus.Supported
                : SupportStatus.Degraded
              : SupportStatus.Unsupported,
            features: domFeatures,
          }
        : { status: SupportStatus.Unsupported },
    };
  }

  function ownDataValue(value, key) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && "value" in descriptor ? descriptor.value : undefined;
    } catch {
      return undefined;
    }
  }

  function dataFunctionAlongPrototype(value, key, maxDepth = 4) {
    let current = value;
    for (let depth = 0; current && depth <= maxDepth; depth += 1) {
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(current, key);
      } catch {
        return null;
      }
      if (descriptor) {
        return "value" in descriptor && callable(descriptor.value) ? descriptor.value : null;
      }
      try {
        current = Object.getPrototypeOf(current);
      } catch {
        return null;
      }
    }
    return null;
  }

  function callableMember(value, key) {
    try {
      const member = value?.[key];
      return callable(member) ? member : null;
    } catch {
      return null;
    }
  }

  function dispatcherFromModule(moduleValue, state) {
    const visited = new Set();
    const queue = [{ value: moduleValue, depth: 0 }];
    let cursor = 0;
    let inspectedKeys = 0;
    let budgetExhausted = false;
    while (cursor < queue.length && visited.size < state.probeMaxNodes) {
      const { value, depth } = queue[cursor];
      cursor += 1;
      if ((!isObject(value) && !callable(value)) || visited.has(value)) continue;
      visited.add(value);

      if (dataFunctionAlongPrototype(value, "dispatchMessage")) {
        return { budgetExhausted: false, dispatcher: value };
      }
      const getInstance = ownDataValue(value, "getInstance");
      if (callable(getInstance)) {
        try {
          const instance = getInstance.call(value);
          if (instance && dataFunctionAlongPrototype(instance, "dispatchMessage")) {
            return { budgetExhausted: false, dispatcher: instance };
          }
        } catch {
          // A candidate export is not capability proof; inspect the rest.
        }
      }
      if (depth >= state.probeMaxDepth) {
        budgetExhausted = true;
        continue;
      }
      let keys;
      try {
        keys = Object.keys(value);
      } catch {
        continue;
      }
      for (const key of keys) {
        if (inspectedKeys >= state.probeMaxKeys) {
          budgetExhausted = true;
          break;
        }
        inspectedKeys += 1;
        const nested = ownDataValue(value, key);
        if (isObject(nested) || callable(nested)) {
          if (queue.length >= state.probeMaxNodes) {
            budgetExhausted = true;
          } else {
            queue.push({ value: nested, depth: depth + 1 });
          }
        }
      }
    }
    if (cursor < queue.length || visited.size >= state.probeMaxNodes) budgetExhausted = true;
    return { budgetExhausted, dispatcher: null };
  }

  function withTimeout(state, operation, timeoutMs = state.timeoutMs) {
    if (!state.setTimeout) return Promise.resolve(operation);
    let timerId;
    const timeout = new Promise((_, reject) => {
      timerId = state.setTimeout(() => {
        const error = new Error(`runtime adapter timed out after ${timeoutMs}ms`);
        error.code = "RUNTIME_ADAPTER_TIMEOUT";
        reject(error);
      }, timeoutMs);
    });
    return Promise.race([Promise.resolve(operation), timeout]).finally(() => {
      if (timerId !== undefined) state.clearTimeout?.(timerId);
    });
  }

  async function selectAdapter(state) {
    if (state.detectionComplete) return capabilitySnapshot(state);
    if (state.detectionPromise) return state.detectionPromise;

    state.detectionPromise = (async () => {
      if (state.loadModule) {
        for (let attempt = 1; attempt <= state.maxAttempts; attempt += 1) {
          const attemptTimeoutMs = Math.max(
            1,
            Math.floor(state.timeoutMs / state.maxAttempts),
          );
          try {
            const moduleValue = await withTimeout(
              state,
              Promise.resolve().then(() => state.loadModule(BundleAdapter.moduleHint)),
              attemptTimeoutMs,
            );
            const probe = dispatcherFromModule(moduleValue, state);
            if (probe.dispatcher) {
              state.dispatcher = probe.dispatcher;
              state.adapter = BundleAdapter.name;
              state.detectionComplete = true;
              return capabilitySnapshot(state);
            }
            if (probe.budgetExhausted) {
              diagnoseOnce(state, "runtime_bundle_probe_budget_exhausted", {
                maxDepth: state.probeMaxDepth,
                maxKeys: state.probeMaxKeys,
                maxNodes: state.probeMaxNodes,
              });
            }
          } catch (error) {
            let timedOut = false;
            try {
              timedOut = error?.code === "RUNTIME_ADAPTER_TIMEOUT";
            } catch {
              timedOut = false;
            }
            if (timedOut) {
              diagnoseOnce(state, "runtime_adapter_timeout", {
                adapter: BundleAdapter.name,
                attemptTimeoutMs,
                attempt,
                totalTimeoutMs: state.timeoutMs,
              });
            }
          }
        }
      }

      if (callableMember(state.root, "dispatchEvent")) {
        state.adapter = WindowEventAdapter.name;
      }
      state.detectionComplete = true;
      if (!state.adapter) {
        diagnoseOnce(state, "runtime_adapter_unsupported", {
          attempts: state.loadModule ? state.maxAttempts : 0,
        });
      }
      return capabilitySnapshot(state);
    })().finally(() => {
      state.detectionPromise = null;
    });
    return state.detectionPromise;
  }

  function domDocument(state) {
    try {
      return state.root?.document || null;
    } catch {
      return null;
    }
  }

  function domSelectorGroup(featureId) {
    return Object.prototype.hasOwnProperty.call(DOM_SELECTORS, featureId)
      ? DOM_SELECTORS[featureId]
      : null;
  }

  function setDomFeatureStatus(state, featureId, status, reason = "") {
    state.domFeatureStatus.set(featureId, status);
    if (status === SupportStatus.Unsupported) {
      diagnoseOnce(
        state,
        "runtime_dom_feature_unsupported",
        { featureId, reason },
        featureId,
      );
    }
    if (status === SupportStatus.Degraded && reason) {
      diagnoseOnce(
        state,
        "runtime_dom_feature_degraded",
        { featureId, reason },
        `${featureId}:${reason}`,
      );
    }
    return status;
  }

  function domQueryFeatureState(state, featureId) {
    let feature = state.domQueryFeatures.get(featureId);
    if (!feature) {
      feature = { disabled: false, failures: 0 };
      state.domQueryFeatures.set(featureId, feature);
    }
    return feature;
  }

  function resetDomQueryFailures(state, featureId) {
    const feature = domQueryFeatureState(state, featureId);
    if (!feature.disabled) feature.failures = 0;
  }

  function recordDomQueryFailure(state, featureId, error) {
    const feature = domQueryFeatureState(state, featureId);
    if (feature.disabled) return true;
    feature.failures += 1;
    if (feature.failures < state.defaultFailureThreshold) return false;
    feature.disabled = true;
    setDomFeatureStatus(state, featureId, SupportStatus.Unsupported, "failure_threshold");
    diagnoseOnce(
      state,
      "runtime_dom_feature_disabled",
      { featureId, failures: feature.failures, ...summarizeError(error) },
      featureId,
    );
    return true;
  }

  function domQueryFeatureDisabled(state, featureId) {
    return domQueryFeatureState(state, featureId).disabled;
  }

  function queryDomFeature(state, featureId, root, firstOnly = false) {
    const group = domSelectorGroup(featureId);
    if (!group) {
      setDomFeatureStatus(state, featureId, SupportStatus.Unsupported, "unknown_feature");
      return { nodes: [], status: SupportStatus.Unsupported, source: null };
    }
    if (domQueryFeatureDisabled(state, featureId)) {
      setDomFeatureStatus(state, featureId, SupportStatus.Unsupported, "circuit_open");
      return { nodes: [], status: SupportStatus.Unsupported, source: null };
    }
    const scope = root || domDocument(state);
    if (!scope || (!callable(scope.querySelectorAll) && !callable(scope.querySelector))) {
      setDomFeatureStatus(state, featureId, SupportStatus.Unsupported, "query_api_unavailable");
      return { nodes: [], status: SupportStatus.Unsupported, source: null };
    }
    const combined = [];
    const combinedSeen = new Set();
    let usedFallback = false;
    let firstQueryError = null;
    for (const source of ["semantic", "fallback"]) {
      const collected = [];
      const seen = new Set();
      for (const selector of group[source]) {
        try {
          let nodes;
          if (firstOnly && callable(scope.querySelector)) {
            const node = scope.querySelector(selector);
            nodes = node ? [node] : [];
          } else {
            nodes = Array.from(scope.querySelectorAll(selector) || []);
          }
          for (const node of nodes) {
            if (!seen.has(node)) {
              seen.add(node);
              collected.push(node);
            }
          }
        } catch (error) {
          if (!firstQueryError) firstQueryError = error;
          diagnoseOnce(
            state,
            "runtime_dom_query_failed",
            { featureId, selector, ...summarizeError(error) },
            featureId,
          );
          continue;
        }
      }
      if (collected.length) {
        if (!firstOnly) {
          let contributed = false;
          for (const node of collected) {
            if (!combinedSeen.has(node)) {
              combinedSeen.add(node);
              combined.push(node);
              contributed = true;
            }
          }
          if (source === "fallback" && contributed) usedFallback = true;
          continue;
        }
        const status = source === "semantic"
          ? SupportStatus.Supported
          : SupportStatus.Degraded;
        setDomFeatureStatus(
          state,
          featureId,
          status,
          source === "fallback" ? "fallback_selector" : "",
        );
        resetDomQueryFailures(state, featureId);
        return { nodes: firstOnly ? collected.slice(0, 1) : collected, status, source };
      }
    }
    if (combined.length) {
      const status = usedFallback ? SupportStatus.Degraded : SupportStatus.Supported;
      setDomFeatureStatus(
        state,
        featureId,
        status,
        usedFallback ? "fallback_selector" : "",
      );
      resetDomQueryFailures(state, featureId);
      return { nodes: combined, status, source: usedFallback ? "mixed" : "semantic" };
    }
    if (firstQueryError) {
      recordDomQueryFailure(state, featureId, firstQueryError);
      setDomFeatureStatus(state, featureId, SupportStatus.Unsupported, "query_failed");
      return { nodes: [], status: SupportStatus.Unsupported, source: null };
    }
    resetDomQueryFailures(state, featureId);
    setDomFeatureStatus(state, featureId, SupportStatus.Degraded, "not_found");
    return { nodes: [], status: SupportStatus.Degraded, source: null };
  }

  function nodeMatchesDomFeature(state, featureId, node) {
    const group = domSelectorGroup(featureId);
    if (!group || !node || !callable(node.matches)) return false;
    if (domQueryFeatureDisabled(state, featureId)) return false;
    let firstQueryError = null;
    for (const source of ["semantic", "fallback"]) {
      for (const selector of group[source]) {
        try {
          if (node.matches(selector)) {
            setDomFeatureStatus(
              state,
              featureId,
              source === "semantic" ? SupportStatus.Supported : SupportStatus.Degraded,
            );
            resetDomQueryFailures(state, featureId);
            return true;
          }
        } catch (error) {
          if (!firstQueryError) firstQueryError = error;
          diagnoseOnce(
            state,
            "runtime_dom_query_failed",
            { featureId, selector, ...summarizeError(error) },
            featureId,
          );
          continue;
        }
      }
    }
    if (firstQueryError) {
      recordDomQueryFailure(state, featureId, firstQueryError);
      setDomFeatureStatus(state, featureId, SupportStatus.Unsupported, "matches_failed");
    } else {
      resetDomQueryFailures(state, featureId);
    }
    return false;
  }

  function closestDomFeature(state, featureId, node) {
    const group = domSelectorGroup(featureId);
    if (!group || !node || !callable(node.closest)) return null;
    if (domQueryFeatureDisabled(state, featureId)) return null;
    let firstQueryError = null;
    for (const source of ["semantic", "fallback"]) {
      for (const selector of group[source]) {
        try {
          const match = node.closest(selector);
          if (match) {
            setDomFeatureStatus(
              state,
              featureId,
              source === "semantic" ? SupportStatus.Supported : SupportStatus.Degraded,
            );
            resetDomQueryFailures(state, featureId);
            return match;
          }
        } catch (error) {
          if (!firstQueryError) firstQueryError = error;
          diagnoseOnce(
            state,
            "runtime_dom_query_failed",
            { featureId, selector, ...summarizeError(error) },
            featureId,
          );
          continue;
        }
      }
    }
    if (firstQueryError) {
      recordDomQueryFailure(state, featureId, firstQueryError);
      setDomFeatureStatus(state, featureId, SupportStatus.Unsupported, "closest_failed");
    } else {
      resetDomQueryFailures(state, featureId);
    }
    return null;
  }

  function hasSemanticDescendant(state, featureId, node) {
    const group = domSelectorGroup(featureId);
    if (!group || !node || !callable(node.querySelector)) return false;
    if (domQueryFeatureDisabled(state, featureId)) return false;
    let firstQueryError = null;
    let completedQuery = false;
    for (const selector of group.semantic) {
      try {
        const match = node.querySelector(selector);
        completedQuery = true;
        if (match) {
          setDomFeatureStatus(state, featureId, SupportStatus.Supported);
          resetDomQueryFailures(state, featureId);
          return true;
        }
      } catch (error) {
        if (!firstQueryError) firstQueryError = error;
        diagnoseOnce(
          state,
          "runtime_dom_query_failed",
          { featureId, selector, ...summarizeError(error) },
          featureId,
        );
      }
    }
    if (!completedQuery && firstQueryError) {
      recordDomQueryFailure(state, featureId, firstQueryError);
      setDomFeatureStatus(state, featureId, SupportStatus.Unsupported, "query_failed");
    } else {
      resetDomQueryFailures(state, featureId);
    }
    return false;
  }

  function closestComposerContainer(state, node) {
    if (!node || !callable(node.closest)) return null;
    if (domQueryFeatureDisabled(state, "composer")) return null;
    let firstQueryError = null;
    for (const source of ["semantic", "fallback"]) {
      for (const selector of DOM_COMPOSER_CONTAINERS[source]) {
        try {
          const container = node.closest(selector);
          if (container) {
            setDomFeatureStatus(
              state,
              "composer",
              source === "semantic" ? SupportStatus.Supported : SupportStatus.Degraded,
              source === "fallback" ? "fallback_selector" : "",
            );
            resetDomQueryFailures(state, "composer");
            return container;
          }
        } catch (error) {
          if (!firstQueryError) firstQueryError = error;
          diagnoseOnce(
            state,
            "runtime_dom_query_failed",
            { featureId: "composer", selector, ...summarizeError(error) },
            "composer",
          );
          continue;
        }
      }
    }
    if (firstQueryError) {
      recordDomQueryFailure(state, "composer", firstQueryError);
      setDomFeatureStatus(state, "composer", SupportStatus.Unsupported, "closest_failed");
    } else {
      resetDomQueryFailures(state, "composer");
    }
    return null;
  }

  function normalizeComposerCandidate(state, node) {
    if (!node) return null;
    return closestComposerContainer(state, node) || node;
  }

  function attribute(node, name) {
    try {
      const value = node?.getAttribute?.(name);
      return typeof value === "string" ? value : "";
    } catch {
      return "";
    }
  }

  function threadIdFromHref(href) {
    if (typeof href !== "string" || !href) return "";
    const match = href.match(/(?:session|conversation|thread)[=/:-]([A-Za-z0-9_.-]+)/i)
      || href.match(/\/([A-Za-z0-9_-]{24,})(?:[/?#]|$)/);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  function locationHref(state) {
    try {
      if (typeof state.root?.location?.href === "string") return state.root.location.href;
      return `${state.root?.location?.pathname || ""}${state.root?.location?.search || ""}${state.root?.location?.hash || ""}`;
    } catch {
      return "";
    }
  }

  function createRuntimeCompatibility(environment = {}) {
    const root = runtimeRoot(environment);
    const state = stateFor(root, environment);

    function normalizedWithSanitizedParams(kind, params, sourceAdapter, raw) {
      const sanitized = sanitizeParams(params);
      if (!sanitized.lossless) {
        diagnoseOnce(
          state,
          "runtime_request_sanitize_incomplete",
          { kind, sourceAdapter },
          sourceAdapter,
        );
        return null;
      }
      return normalizedRequest(kind, sanitized.value, sourceAdapter, raw);
    }

    function normalizeRequest(raw) {
      try {
        if (!isObject(raw)) return null;

        if (
          (raw.type === UpstreamEnvelope.NestedRpc || raw.type === UpstreamEnvelope.WorkerRpc) &&
          isObject(raw.request)
        ) {
          const kind = upstreamRequestKind(raw.request.method);
          if (!kind) return null;
          return normalizedWithSanitizedParams(
            kind,
            raw.request.params,
            SourceAdapter.NestedParams,
            raw,
          );
        }

        if (raw.type === UpstreamEnvelope.NestedThreadPrewarm && isObject(raw.request)) {
          return normalizedWithSanitizedParams(
            InternalRequestKind.StartThread,
            raw.request.params,
            SourceAdapter.NestedParams,
            raw,
          );
        }

        if (raw.type === UpstreamEnvelope.DirectRpc) {
          const wrappedMethod = isObject(raw.params) ? raw.params.method : null;
          const outerKind = upstreamRequestKind(raw.method);
          const wrappedKind = upstreamRequestKind(wrappedMethod);
          if (outerKind && wrappedKind && outerKind !== wrappedKind) return null;
          const kind = outerKind || wrappedKind;
          if (!kind) return null;
          if (wrappedKind) {
            const { method: _method, ...wrappedParams } = raw.params;
            return normalizedWithSanitizedParams(
              kind,
              wrappedParams,
              SourceAdapter.HostWrapperParams,
              raw,
            );
          }
          return normalizedWithSanitizedParams(
            kind,
            raw.params,
            SourceAdapter.DirectParams,
            raw,
          );
        }

        if (raw.type === UpstreamEnvelope.DirectThreadPrewarm) {
          return normalizedWithSanitizedParams(
            InternalRequestKind.StartThread,
            raw.params,
            SourceAdapter.DirectParams,
            raw,
          );
        }

        if (
          raw.type === UpstreamEnvelope.InlineThreadStart ||
          raw.type === UpstreamEnvelope.InlineHostThreadStart
        ) {
          const { type: _type, ...params } = raw;
          return normalizedWithSanitizedParams(
            InternalRequestKind.StartThread,
            params,
            SourceAdapter.InlinePayload,
            raw,
          );
        }

        if (raw.type === UpstreamEnvelope.DirectTurnStart) {
          return normalizedWithSanitizedParams(
            InternalRequestKind.StartTurn,
            raw.params,
            SourceAdapter.DirectParams,
            raw,
          );
        }

        if (
          raw.type === UpstreamEnvelope.NestedWorktreeCreate &&
          isObject(raw.request) &&
          raw.request.launchMode === UpstreamEnvelope.InlineThreadStart
        ) {
          return normalizedWithSanitizedParams(
            InternalRequestKind.CreateWorktree,
            raw.request,
            SourceAdapter.NestedPayload,
            raw,
          );
        }

        return null;
      } catch (error) {
        diagnoseOnce(state, "runtime_transport_message_failed", summarizeError(error));
        return null;
      }
    }

    function replaceRequestParams(raw, normalized, nextParams) {
      try {
        if (!isObject(raw) || !isObject(normalized) || !isPlainRecord(nextParams)) return raw;

        if (normalized.sourceAdapter === SourceAdapter.NestedParams && isObject(raw.request)) {
          return { ...raw, request: { ...raw.request, params: nextParams } };
        }
        if (normalized.sourceAdapter === SourceAdapter.DirectParams) {
          return { ...raw, params: nextParams };
        }
        if (
          normalized.sourceAdapter === SourceAdapter.HostWrapperParams &&
          isObject(raw.params)
        ) {
          return { ...raw, params: { ...nextParams, method: raw.params.method } };
        }
        if (normalized.sourceAdapter === SourceAdapter.InlinePayload) {
          return { ...nextParams, type: raw.type };
        }
        if (normalized.sourceAdapter === SourceAdapter.NestedPayload) {
          return { ...raw, request: nextParams };
        }
        return raw;
      } catch (error) {
        diagnoseOnce(state, "runtime_transport_message_failed", summarizeError(error));
        return raw;
      }
    }

    function detectCapabilities() {
      return selectAdapter(state);
    }

    function applyFeatureHandlers(raw) {
      let currentRaw = raw;
      let currentRequest = normalizeRequest(currentRaw);
      if (!currentRequest) return raw;

      for (const [featureId, feature] of state.features) {
        if (!feature.active) continue;
        let nextParams;
        try {
          nextParams = feature.handler(currentRequest);
        } catch (error) {
          recordFeatureFailure(state, featureId, feature, error);
          continue;
        }
        if (nextParams === undefined || nextParams === null) {
          feature.failures = 0;
          continue;
        }
        if (!isPlainRecord(nextParams)) {
          recordFeatureFailure(
            state,
            featureId,
            feature,
            { name: "InvalidHandlerResult", message: "handler result must be a plain record" },
          );
          continue;
        }
        const sanitized = sanitizeParams(nextParams);
        if (!sanitized.lossless) {
          recordFeatureFailure(
            state,
            featureId,
            feature,
            { name: "InvalidHandlerResult", message: "handler result was not lossless" },
          );
          continue;
        }
        const replacedRaw = replaceRequestParams(currentRaw, currentRequest, sanitized.value);
        const replacedRequest = replacedRaw === currentRaw ? null : normalizeRequest(replacedRaw);
        if (!replacedRequest) continue;
        currentRaw = replacedRaw;
        currentRequest = replacedRequest;
        feature.failures = 0;
      }
      return currentRaw;
    }

    function installBundleAdapter() {
      const dispatcher = state.dispatcher;
      const original = dispatcher
        ? dataFunctionAlongPrototype(dispatcher, "dispatchMessage")
        : null;
      if (!callable(original)) return false;
      const wrapper = function chatgptPlusDispatchMessage(type, payload) {
        if (!SupportedUpstreamEnvelopes.has(type)) {
          return original.call(this, type, payload);
        }
        let nextType = type;
        let nextPayload = payload;
        try {
          const raw = isObject(payload) ? { ...payload, type } : { type };
          const nextRaw = applyFeatureHandlers(raw);
          if (nextRaw !== raw) {
            nextType = typeof nextRaw.type === "string" ? nextRaw.type : type;
            const { type: _type, ...rebuiltPayload } = nextRaw;
            nextPayload = rebuiltPayload;
          }
        } catch (error) {
          diagnoseOnce(state, "runtime_transport_message_failed", summarizeError(error));
        }
        return original.call(this, nextType, nextPayload);
      };
      try {
        dispatcher.dispatchMessage = wrapper;
        return dispatcher.dispatchMessage === wrapper;
      } catch {
        return false;
      }
    }

    function defaultCreateEvent(type, detail, original) {
      const CustomEventConstructor =
        (callable(root.CustomEvent) && root.CustomEvent) ||
        (typeof CustomEvent === "function" && CustomEvent);
      if (!CustomEventConstructor) return null;
      return new CustomEventConstructor(type, {
        detail,
        bubbles: !!original.bubbles,
        cancelable: !!original.cancelable,
        composed: !!original.composed,
      });
    }

    function installWindowEventAdapter() {
      const original = callableMember(root, "dispatchEvent");
      if (!original) return false;
      const wrapper = function chatgptPlusDispatchEvent(event) {
        let eventType;
        try {
          eventType = event?.type;
        } catch (error) {
          diagnoseOnce(state, "runtime_transport_message_failed", summarizeError(error));
          return original.call(this, event);
        }
        if (!event || eventType !== WindowEventAdapter.messageEvent) {
          return original.call(this, event);
        }
        state.windowEventVerified = true;
        let nextEvent = null;
        try {
          const raw = isObject(event.detail) ? event.detail : null;
          const nextRaw = raw ? applyFeatureHandlers(raw) : raw;
          if (raw && nextRaw !== raw) {
            nextEvent = state.createEvent
              ? state.createEvent(eventType, nextRaw, event)
              : defaultCreateEvent(eventType, nextRaw, event);
          }
        } catch (error) {
          diagnoseOnce(state, "runtime_transport_message_failed", summarizeError(error));
        }
        return original.call(this, nextEvent || event);
      };
      try {
        root.dispatchEvent = wrapper;
        return root.dispatchEvent === wrapper;
      } catch {
        return false;
      }
    }

    async function installSelectedAdapter() {
      if (state.installationTerminal) {
        if (state.installed) {
          return {
            ...state.installResult,
            status: capabilitySnapshot(state).requestInterceptor.status,
          };
        }
        return state.installResult;
      }
      const capabilities = await selectAdapter(state);
      if (!state.adapter) {
        state.installationTerminal = true;
        state.installResult = {
          status: capabilities.status,
          installed: false,
          adapter: null,
        };
        return state.installResult;
      }
      const selectedAdapter = state.adapter;
      try {
        state.installed =
          state.adapter === BundleAdapter.name
            ? installBundleAdapter()
            : installWindowEventAdapter();
      } catch {
        state.installed = false;
      }
      state.installationTerminal = true;
      if (!state.installed) {
        state.adapter = null;
        state.dispatcher = null;
        state.installResult = {
          status: SupportStatus.Unsupported,
          installed: false,
          adapter: null,
        };
        diagnoseOnce(state, "runtime_adapter_install_failed", {
          adapter: selectedAdapter,
        });
        return state.installResult;
      }
      state.installResult = {
        status: capabilitySnapshot(state).requestInterceptor.status,
        installed: true,
        adapter: state.adapter,
      };
      return state.installResult;
    }

    function installRequestInterceptor(featureId, handler, options = {}) {
      if (typeof featureId !== "string" || !featureId || !callable(handler)) {
        return Promise.resolve({
          status: SupportStatus.Unsupported,
          installed: false,
          adapter: null,
        });
      }
      state.features.set(featureId, {
        active: true,
        failures: 0,
        handler,
        failureThreshold: positiveInteger(
          options.failureThreshold,
          state.defaultFailureThreshold,
        ),
      });
      if (!state.installPromise) {
        state.installPromise = installSelectedAdapter().finally(() => {
          state.installPromise = null;
        });
      }
      return state.installPromise;
    }

    function sessions(rootNode) {
      const unique = [];
      const seenNodes = new Set();
      for (const row of queryDomFeature(state, "sessions", rootNode).nodes) {
        const testId = attribute(row, "data-testid");
        const id = attribute(row, "data-app-action-sidebar-thread-id")
          || attribute(row, "data-thread-id")
          || attribute(row, "data-session-id")
          || threadIdFromHref(attribute(row, "href"))
          || (/^history-item[-_:]?/.test(testId)
            ? testId.replace(/^history-item[-_:]?/, "")
            : "");
        if (!id) continue;
        if (seenNodes.has(row)) continue;
        seenNodes.add(row);
        unique.push(row);
      }
      return unique;
    }

    function sessionRef(row) {
      if (!row) return { threadId: "", title: "" };
      const href = attribute(row, "href")
        || attribute(row.querySelector?.("a[href]"), "href");
      const threadId = attribute(row, "data-app-action-sidebar-thread-id")
        || attribute(row, "data-thread-id")
        || attribute(row, "data-session-id")
        || threadIdFromHref(href)
        || (/^history-item[-_:]?/.test(attribute(row, "data-testid"))
          ? attribute(row, "data-testid").replace(/^history-item[-_:]?/, "")
          : "");
      const titleNode = queryDomFeature(state, "sessionTitle", row, true).nodes[0];
      let title = "";
      try {
        const rawTitle = String(titleNode?.textContent || row.textContent || "");
        title = (titleNode
          ? rawTitle
          : rawTitle.replace(/\s*(导出|删除|移动|移出项目)(\s*(导出|删除|移动|移出项目))*$/g, ""))
          .trim().slice(0, 160);
      } catch {
        title = "";
      }
      return { threadId, title };
    }

    function composer(rootNode) {
      const candidate = queryDomFeature(state, "composer", rootNode, true).nodes[0] || null;
      return normalizeComposerCandidate(state, candidate);
    }

    function composerCandidates(rootNode) {
      return Array.from(new Set(
        queryDomFeature(state, "composer", rootNode).nodes
          .map((node) => normalizeComposerCandidate(state, node))
          .filter(Boolean),
      ));
    }

    function threadMenus(rootNode) {
      const nodes = queryDomFeature(state, "threadMenu", rootNode).nodes;
      const group = DOM_SELECTORS.threadMenu;
      const normalized = nodes.map((node) => {
        let isSemantic = false;
        let isFallback = false;
        try {
          isSemantic = group.semantic.some((selector) => node.matches?.(selector));
          isFallback = group.fallback.some((selector) => node.matches?.(selector));
        } catch (error) {
          setDomFeatureStatus(state, "threadMenu", SupportStatus.Unsupported, "matches_failed");
          diagnoseOnce(
            state,
            "runtime_dom_query_failed",
            { featureId: "threadMenu", ...summarizeError(error) },
            "threadMenu",
          );
          return null;
        }
        if (!isFallback || isSemantic || !callable(node.querySelector)) return node;
        for (const selector of group.semantic) {
          try {
            const inner = node.querySelector(selector);
            if (inner) return inner;
          } catch (error) {
            setDomFeatureStatus(state, "threadMenu", SupportStatus.Unsupported, "query_failed");
            diagnoseOnce(
              state,
              "runtime_dom_query_failed",
              { featureId: "threadMenu", selector, ...summarizeError(error) },
              "threadMenu",
            );
            return null;
          }
        }
        return node;
      }).filter(Boolean);
      return Array.from(new Set(normalized));
    }

    function menuItems(menu) {
      return queryDomFeature(state, "menuItems", menu).nodes;
    }

    function containsFeature(featureId, node) {
      if (!node) return false;
      if (nodeMatchesDomFeature(state, featureId, node)) return true;
      return queryDomFeature(state, featureId, node, true).nodes.length > 0;
    }

    function selectorText(featureId) {
      const group = domSelectorGroup(featureId);
      return group ? [...group.semantic, ...group.fallback].join(", ") : "";
    }

    function classifySurface() {
      const href = locationHref(state);
      let route = "";
      let pathname = "";
      try {
        const url = new URL(href);
        route = String(url.searchParams.get("initialRoute") || "").trim();
        pathname = String(url.pathname || "");
      } catch {
      }
      const auxiliaryRoute = UPSTREAM_AUXILIARY_ROUTES.find((candidate) =>
        route === candidate || route.startsWith(`${candidate}/`));
      if (auxiliaryRoute) {
        return {
          kind: SurfaceKind.Auxiliary,
          status: SupportStatus.Supported,
          source: "initial-route",
          route,
        };
      }

      const documentValue = domDocument(state);
      if (documentValue && callable(documentValue.querySelectorAll)) {
        const hasWorkspaceCapability = ["sessions", "composer"].some((featureId) =>
          queryDomFeature(state, featureId, documentValue, true).nodes.length > 0);
        if (hasWorkspaceCapability) {
          return {
            kind: SurfaceKind.Workspace,
            status: SupportStatus.Supported,
            source: "semantic-dom",
            route,
          };
        }
      }

      if (!route && /(?:^|\/)index\.html$/.test(pathname)) {
        return {
          kind: SurfaceKind.Workspace,
          status: SupportStatus.Degraded,
          source: "app-entry-route",
          route,
        };
      }
      return {
        kind: SurfaceKind.Unknown,
        status: SupportStatus.Degraded,
        source: null,
        route,
      };
    }

    function featureStatus(featureId) {
      if (featureId === "observer") {
        return state.domFeatureStatus.get("observer")
          || (state.MutationObserver ? SupportStatus.Supported : SupportStatus.Unsupported);
      }
      if (!domSelectorGroup(featureId)) return SupportStatus.Unsupported;
      return state.domFeatureStatus.get(featureId) || SupportStatus.Degraded;
    }

    function domStatus() {
      const documentValue = domDocument(state);
      const features = {};
      for (const featureId of Object.keys(DOM_SELECTORS)) {
        features[featureId] = featureStatus(featureId);
      }
      const core = ["sessions", "composer", "threadMenu"].map(featureStatus);
      return {
        status: documentValue && callable(documentValue.querySelectorAll)
          ? core.every((value) => value === SupportStatus.Supported)
            ? SupportStatus.Supported
            : SupportStatus.Degraded
          : SupportStatus.Unsupported,
        features,
        observation: state.MutationObserver
          ? SupportStatus.Supported
          : SupportStatus.Unsupported,
      };
    }

    function disconnect(featureId) {
      const observer = state.domObservers.get(featureId);
      if (observer) {
        try {
          observer.instance?.disconnect?.();
        } catch {
        }
        observer.active = false;
        state.domObservers.delete(featureId);
      }
      const pollController = state.domPolls.get(featureId);
      if (pollController) {
        pollController.stop();
      }
    }

    function resetFeature(featureId) {
      if (!domSelectorGroup(featureId) && featureId !== "observer") return false;
      state.domQueryFeatures.set(featureId, { disabled: false, failures: 0 });
      state.domFeatureStatus.delete(featureId);
      return true;
    }

    function observe(featureId, callback, options = {}) {
      if (typeof featureId !== "string" || !featureId || !callable(callback)) {
        return { status: SupportStatus.Unsupported, active: false, disconnect() {} };
      }
      disconnect(featureId);
      const MutationObserverConstructor = state.MutationObserver
        || (callable(state.root?.MutationObserver) ? state.root.MutationObserver : null);
      const target = options.target || domDocument(state)?.body || domDocument(state)?.documentElement;
      if (!MutationObserverConstructor || !target) {
        setDomFeatureStatus(state, "observer", SupportStatus.Unsupported,
          !MutationObserverConstructor ? "constructor_unavailable" : "target_unavailable");
        diagnoseOnce(
          state,
          "runtime_dom_observer_unsupported",
          { featureId, reason: !MutationObserverConstructor ? "constructor_unavailable" : "target_unavailable" },
          "observer",
        );
        return { status: SupportStatus.Unsupported, active: false, disconnect() {} };
      }
      const controller = {
        status: SupportStatus.Supported,
        active: true,
        failures: 0,
        instance: null,
        disconnect() {
          if (!controller.active) return;
          controller.active = false;
          try {
            controller.instance?.disconnect?.();
          } catch {
          }
          if (state.domObservers.get(featureId) === controller) {
            state.domObservers.delete(featureId);
          }
        },
      };
      const failureThreshold = positiveInteger(
        options.failureThreshold,
        state.defaultFailureThreshold,
      );
      try {
        controller.instance = new MutationObserverConstructor((mutations, observer) => {
          if (!controller.active) return;
          try {
            callback(mutations, observer);
            controller.failures = 0;
          } catch (error) {
            controller.failures += 1;
            if (controller.failures >= failureThreshold) {
              controller.status = SupportStatus.Unsupported;
              controller.disconnect();
              diagnoseOnce(
                state,
                "runtime_dom_observer_disabled",
                { featureId, failures: controller.failures, ...summarizeError(error) },
                featureId,
              );
            }
          }
        });
        controller.instance.observe(target, options.observerOptions || {
          childList: true,
          subtree: true,
        });
        state.domObservers.set(featureId, controller);
        state.domFeatureStatus.set("observer", SupportStatus.Supported);
        return controller;
      } catch (error) {
        controller.disconnect();
        setDomFeatureStatus(state, "observer", SupportStatus.Unsupported, "construction_failed");
        diagnoseOnce(
          state,
          "runtime_dom_observer_unsupported",
          { featureId, reason: "construction_failed", ...summarizeError(error) },
          featureId,
        );
        return { status: SupportStatus.Unsupported, active: false, disconnect() {} };
      }
    }

    function poll(featureId, callback, options = {}) {
      if (typeof featureId !== "string" || !featureId || !callable(callback) || !state.setTimeout) {
        return { status: SupportStatus.Unsupported, active: false, attempts: 0, stop() {} };
      }
      disconnect(featureId);
      const intervalMs = positiveInteger(options.intervalMs, 350);
      const maxAttempts = positiveInteger(options.maxAttempts, 24);
      const failureThreshold = positiveInteger(
        options.failureThreshold,
        state.defaultFailureThreshold,
      );
      let timerId;
      const controller = {
        status: SupportStatus.Supported,
        active: true,
        attempts: 0,
        failures: 0,
        stop() {
          if (!controller.active) return;
          controller.active = false;
          if (timerId !== undefined) state.clearTimeout?.(timerId);
          if (state.domPolls.get(featureId) === controller) state.domPolls.delete(featureId);
        },
      };
      const tick = () => {
        if (!controller.active) return;
        controller.attempts += 1;
        let complete = false;
        try {
          complete = callback(controller.attempts) === true;
          controller.failures = 0;
        } catch (error) {
          controller.failures += 1;
          if (controller.failures >= failureThreshold) {
            controller.status = SupportStatus.Unsupported;
            controller.stop();
            diagnoseOnce(
              state,
              "runtime_dom_poll_disabled",
              { featureId, failures: controller.failures, ...summarizeError(error) },
              featureId,
            );
            return;
          }
        }
        if (complete || controller.attempts >= maxAttempts) {
          controller.stop();
          return;
        }
        timerId = state.setTimeout(tick, intervalMs);
      };
      state.domPolls.set(featureId, controller);
      timerId = state.setTimeout(tick, intervalMs);
      return controller;
    }

    function resolveCurrentThread() {
      const rows = sessions();
      const href = locationHref(state);
      let locationId = threadIdFromHref(href);
      for (const row of rows) {
        const ref = sessionRef(row);
        const marked = nodeMatchesDomFeature(state, "currentMarker", row)
          || hasSemanticDescendant(state, "currentMarker", row);
        if (marked && ref.threadId) return ref;
      }
      for (const row of rows) {
        const ref = sessionRef(row);
        const rowHref = attribute(row, "href") || attribute(row.querySelector?.("a[href]"), "href");
        if (ref.threadId && (ref.threadId === locationId || (rowHref && href.includes(rowHref)))) {
          return ref;
        }
      }
      if (!locationId) locationId = threadIdFromHref(href);
      return locationId ? { threadId: locationId, title: "" } : null;
    }

    function observeSessions(callback, options = {}) {
      if (!callable(callback)) {
        return { status: SupportStatus.Unsupported, active: false, disconnect() {} };
      }
      return observe(options.featureId || "sessions", (mutations) => {
        callback(sessions(options.root), mutations);
      }, options);
    }

    const dom = Object.freeze({
      sessions,
      sessionRef,
      composer,
      composerCandidates,
      isComposer: (node) => closestComposerContainer(state, node) === node
        || nodeMatchesDomFeature(state, "composer", node),
      closestComposer: (node) => closestComposerContainer(state, node)
        || closestDomFeature(state, "composer", node),
      threadMenus,
      menuItems,
      closestThreadMenu: (node) => closestDomFeature(state, "threadMenu", node),
      matches: (featureId, node) => nodeMatchesDomFeature(state, featureId, node),
      containsFeature,
      selectorText,
      classifySurface,
      status: domStatus,
      featureStatus,
      observe,
      poll,
      disconnect,
      resetFeature,
    });

    const runtime = {
      apiVersion: RuntimeApiVersion,
      InternalRequestKind,
      SupportStatus,
      SurfaceKind,
      normalizeRequest,
      replaceRequestParams,
      detectCapabilities,
      installRequestInterceptor,
      observeSessions,
      resolveCurrentThread,
      dom,
    };
    Object.defineProperty(runtime, RuntimeInstanceBrand, {
      configurable: false,
      enumerable: false,
      value: RuntimeApiVersion,
      writable: false,
    });
    return Object.freeze(runtime);
  }

  function isCompatibleRuntimeInstance(value) {
    try {
      if (!value || typeof value !== "object") return false;
      if (value[RuntimeInstanceBrand] !== RuntimeApiVersion) return false;
      if (value.apiVersion !== RuntimeApiVersion) return false;
      if (!value.dom || typeof value.dom !== "object") return false;
      if (typeof value.dom.classifySurface !== "function") return false;
      return RuntimeInterfaceMethods.every((method) => typeof value[method] === "function");
    } catch {
      return false;
    }
  }

  const exported = { apiVersion: RuntimeApiVersion, createRuntimeCompatibility };
  Object.defineProperty(exported, "isCompatibleRuntimeInstance", {
    configurable: false,
    enumerable: false,
    value: isCompatibleRuntimeInstance,
    writable: false,
  });
  return Object.freeze(exported);
});
