export type RelayFileProfile = {
  configContents: string;
  authContents: string;
  contextWindow: string;
  autoCompactLimit: string;
};

export type RelayCommonSettings = {
  relayCommonConfigContents: string;
};

export function projectRelayFiles(
  profile: RelayFileProfile,
  settings: RelayCommonSettings,
): {
  configPreview: string;
  profileConfigFromPreview: (contents: string) => string;
} {
  const configWithLimits = applyContextLimitPreview(
    stripNativeExtensionTables(profile.configContents),
    profile,
  );
  const commonConfig = settings.relayCommonConfigContents || "";
  return {
    configPreview: joinTomlSectionsRootFirst([configWithLimits, commonConfig]),
    profileConfigFromPreview: (contents) => stripCommonConfigTextFallback(contents, commonConfig),
  };
}

export function stripNativeExtensionTables(contents: string): string {
  const kept: string[] = [];
  let skipping = false;
  let inRoot = true;
  for (const line of contents.split(/\r?\n/)) {
    const header = /^\s*\[{1,2}([^\]]+)\]{1,2}\s*$/.exec(line)?.[1]?.trim() ?? "";
    if (header) {
      inRoot = false;
      skipping = /^(mcp_servers|skills|plugins)(?:\.|$)/.test(header);
    }
    const rootExtensionKey = inRoot
      && /^\s*(mcp_servers|skills|plugins)(?:\.|\s*=)/.test(line);
    if (!skipping && !rootExtensionKey) kept.push(line);
  }
  const normalized = kept.join("\n").trim();
  return normalized ? `${normalized}\n` : "";
}

export function promoteRelayCommonConfig<
  Settings extends RelayCommonSettings,
  Profile extends RelayFileProfile,
>(settings: Settings, profile: Profile, extracted: {
  commonConfigContents: string;
  profileConfigContents: string;
}): {
  settings: Settings;
  profile: Profile;
} {
  return {
    settings: {
      ...settings,
      relayCommonConfigContents: extracted.commonConfigContents,
    },
    profile: {
      ...profile,
      configContents: extracted.profileConfigContents,
    },
  };
}

function stripCommonConfigTextFallback(configContents: string, commonConfig: string): string {
  const rootKeys = new Set<string>();
  const tableHeaders = new Set<string>();
  let inRoot = true;
  for (const line of commonConfig.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (isTomlTableHeader(trimmed)) {
      inRoot = false;
      tableHeaders.add(trimmed);
      continue;
    }
    if (inRoot) {
      const key = tomlRootKeyFromLine(trimmed);
      if (key) rootKeys.add(key);
    }
  }
  if (!rootKeys.size && !tableHeaders.size)
    return ensureTrailingNewline(configContents.trimEnd());
  const kept: string[] = [];
  let skippingTable = false;
  for (const line of configContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (isTomlTableHeader(trimmed)) {
      skippingTable = tableHeaders.has(trimmed);
      if (skippingTable) continue;
    }
    if (skippingTable) continue;
    const key = tomlRootKeyFromLine(trimmed);
    if (!key || !rootKeys.has(key)) kept.push(line);
  }
  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function applyContextLimitPreview(configContents: string, profile: RelayFileProfile): string {
  let lines = configContents.split(/\r?\n/);
  for (const [key, value] of [
    ["model_context_window", profile.contextWindow],
    ["model_auto_compact_token_limit", profile.autoCompactLimit],
  ]) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    let replaced = false;
    lines = lines.map((line) => !replaced && new RegExp(`^\\s*${key}\\s*=`).test(line)
      ? (replaced = true, `${key} = ${trimmed}`)
      : line);
    if (!replaced) {
      const firstTable = lines.findIndex(isTomlTableHeader);
      lines.splice(firstTable >= 0 ? firstTable : lines.length, 0, `${key} = ${trimmed}`);
    }
  }
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

function joinTomlSectionsRootFirst(sections: string[]): string {
  const rootParts: string[] = [];
  const tableParts: string[] = [];
  for (const section of sections) {
    const { root, tables } = splitTomlRootAndTables(section);
    if (root.trim()) rootParts.push(root.trim());
    if (tables.trim()) tableParts.push(tables.trim());
  }
  return normalizeDuplicateTomlTables(ensureTrailingNewline(
    [...dedupeTomlRootLines(rootParts), ...tableParts]
      .map((section) => section.trim())
      .filter(Boolean)
      .join("\n\n"),
  ));
}

function normalizeDuplicateTomlTables(contents: string): string {
  const seenHeaders = new Set<string>();
  const kept: string[] = [];
  let skipping = false;
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (isTomlTableHeader(trimmed)) {
      skipping = seenHeaders.has(trimmed);
      seenHeaders.add(trimmed);
      if (skipping) continue;
    }
    if (!skipping) kept.push(line);
  }
  return ensureTrailingNewline(kept.join("\n").trimEnd());
}

function dedupeTomlRootLines(rootParts: string[]): string[] {
  const rootLines = rootParts.join("\n").split(/\r?\n/).map((line) => line.trimEnd());
  const rootSeen = new Set<string>();
  const kept: string[] = [];
  for (let index = rootLines.length - 1; index >= 0; index -= 1) {
    const line = rootLines[index];
    const key = tomlRootKeyFromLine(line.trim());
    if (key) {
      if (rootSeen.has(key)) continue;
      rootSeen.add(key);
    }
    kept.push(line);
  }
  const normalized = kept.reverse().join("\n").trim();
  return normalized ? [normalized] : [];
}

function splitTomlRootAndTables(section: string): { root: string; tables: string } {
  const lines = section.trim().split(/\r?\n/);
  const firstTable = lines.findIndex(isTomlTableHeader);
  if (firstTable < 0) return { root: lines.join("\n"), tables: "" };
  return {
    root: lines.slice(0, firstTable).join("\n"),
    tables: lines.slice(firstTable).join("\n"),
  };
}

function tomlRootKeyFromLine(line: string): string | null {
  if (!line || line.startsWith("#")) return null;
  const index = line.indexOf("=");
  return index < 0 ? null : line.slice(0, index).trim() || null;
}

function isTomlTableHeader(line: string): boolean {
  return /^\s*\[{1,2}[^\]]+\]{1,2}\s*$/.test(line);
}

function ensureTrailingNewline(value: string): string {
  return value.trim() ? `${value}\n` : "";
}
