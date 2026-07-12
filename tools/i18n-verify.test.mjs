import assert from "node:assert/strict";
import { test } from "node:test";

import { auditCatalog } from "./i18n-verify-core.mjs";

test("reports a dynamic-only key missing from the catalog", () => {
  const result = auditCatalog({
    directKeys: new Set(),
    dynamicManifestKeys: new Set(["动态标题"]),
    dynamicProducerKeys: new Set(["动态标题"]),
    catalogKeys: new Set(),
    hasDynamicCall: true,
  });

  assert.deepEqual(result.missing, ["动态标题"]);
  assert.deepEqual(result.orphanedDynamicKeys, []);
});

test("reports a stale dynamic manifest entry and a stale catalog key", () => {
  const result = auditCatalog({
    directKeys: new Set(),
    dynamicManifestKeys: new Set(["已删除的动态标题"]),
    dynamicProducerKeys: new Set(),
    catalogKeys: new Set(["已删除的动态标题"]),
    hasDynamicCall: true,
  });

  assert.deepEqual(result.orphanedDynamicKeys, ["已删除的动态标题"]);
  assert.deepEqual(result.extra, []);
});

test("reports a dynamic producer omitted from an existing non-empty manifest", () => {
  const result = auditCatalog({
    directKeys: new Set(),
    dynamicManifestKeys: new Set(["已登记标题"]),
    dynamicProducerKeys: new Set(["已登记标题", "漏登记标题"]),
    catalogKeys: new Set(["已登记标题"]),
    hasDynamicCall: true,
  });

  assert.deepEqual(result.unregisteredDynamicProducers, ["漏登记标题"]);
});
