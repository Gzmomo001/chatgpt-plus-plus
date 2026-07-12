export function auditCatalog({
  directKeys,
  dynamicManifestKeys,
  dynamicProducerKeys,
  catalogKeys,
  hasDynamicCall,
}) {
  const expectedKeys = new Set([...directKeys, ...dynamicManifestKeys]);
  return {
    expectedKeys,
    missing: [...expectedKeys].filter((key) => !catalogKeys.has(key)),
    extra: [...catalogKeys].filter((key) => !expectedKeys.has(key)),
    orphanedDynamicKeys: [...dynamicManifestKeys].filter((key) => !dynamicProducerKeys.has(key)),
    unregisteredDynamicProducers: [...dynamicProducerKeys].filter((key) => !dynamicManifestKeys.has(key)),
    missingDynamicManifest: hasDynamicCall && dynamicManifestKeys.size === 0,
  };
}
