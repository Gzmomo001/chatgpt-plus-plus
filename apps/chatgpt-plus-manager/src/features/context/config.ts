export type ContextKind = "mcp" | "skill" | "plugin";
export type ContextEntry = {
  id: string;
  kind: ContextKind;
  title: string;
  summary: string;
  tomlBody: string;
  enabled: boolean;
};
export type ContextEntries = {
  mcpServers: ContextEntry[];
  skills: ContextEntry[];
  plugins: ContextEntry[];
};
export type ContextSelection = {
  mcpServers: readonly string[];
  skills: readonly string[];
  plugins: readonly string[];
};
export type RelayFileProfile = {
  configContents: string;
  authContents: string;
  contextWindow: string;
  autoCompactLimit: string;
  contextSelection: ContextSelection;
};
export type RelayContextSettings = {
  relayCommonConfigContents: string;
  relayContextConfigContents: string;
};
const contextKinds: Array<{
  kind: ContextKind;
  tableName: string;
}> = [
    { kind: "mcp", tableName: "mcp_servers" },
    { kind: "skill", tableName: "skills" },
    { kind: "plugin", tableName: "plugins" },
  ];
export function parseContextConfig(configContents: string): ContextEntries {
  configContents = normalizeDuplicateTomlTables(configContents);
  return {
    mcpServers: parseContextEntries(configContents, "mcp", "mcp_servers"),
    skills: parseContextEntries(configContents, "skill", "skills"),
    plugins: parseContextEntries(configContents, "plugin", "plugins"),
  };
}
export function setContextEntryEnabled(tomlBody: string, enabled: boolean): string {
  const lines = tomlBody.trimEnd().split(/\r?\n/);
  const nextValue = `enabled = ${enabled ? "true" : "false"}`;
  let replaced = false;
  const next = lines.map((line) => {
    if (/^\s*enabled\s*=/.test(line)) {
      replaced = true;
      return nextValue;
    }
    return line;
  });
  if (!replaced)
    next.unshift(nextValue);
  return ensureTrailingNewline(next.join("\n").trimEnd());
}
export function normalizeContextSettings(relayCommonConfigContents: string, relayContextConfigContents: string): {
  relayCommonConfigContents: string;
  relayContextConfigContents: string;
} {
  const splitCommon = splitContextConfigText(relayCommonConfigContents);
  return {
    relayCommonConfigContents: splitCommon.common,
    relayContextConfigContents: joinTomlSectionsRootFirst([
      relayContextConfigContents,
      splitCommon.context,
    ]),
  };
}
export function projectRelayFiles(profile: RelayFileProfile, settings: RelayContextSettings, contextEntries: ContextEntries): {
  configPreview: string;
  profileConfigFromPreview: (contents: string) => string;
} {
  const selectedEntries = filterContextEntriesBySelection(contextEntries, profile.contextSelection);
  return {
    configPreview: effectiveRelayConfigPreview(profile, settings, selectedEntries),
    profileConfigFromPreview: (contents) => {
      const withoutCommon = stripCommonConfigTextFallback(contents, relayCombinedCommonConfig(settings));
      return stripContextEntriesFromConfig(withoutCommon, selectedEntries);
    },
  };
}
export function promoteRelayCommonConfig<Settings extends RelayContextSettings, Profile extends RelayFileProfile>(settings: Settings, profile: Profile, extracted: {
  commonConfigContents: string;
  profileConfigContents: string;
}): {
  settings: Settings;
  profile: Profile;
} {
  const split = splitContextConfigText(extracted.commonConfigContents);
  return {
    settings: {
      ...settings,
      relayCommonConfigContents: split.common,
      relayContextConfigContents: joinTomlSectionsRootFirst([
        settings.relayContextConfigContents,
        split.context,
      ]),
    },
    profile: {
      ...profile,
      configContents: extracted.profileConfigContents,
    },
  };
}
function parseContextEntries(contents: string, kind: ContextKind, tableName: string): ContextEntry[] {
  const entries = new Map<string, ContextEntry>();
  let currentId: string | null = null;
  let body: string[] = [];
  const flush = () => {
    if (!currentId)
      return;
    const tomlBody = ensureTrailingNewline(body.join("\n").trimEnd());
    entries.set(currentId, {
      id: currentId,
      kind,
      title: currentId,
      summary: tomlBody.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith("#") && !/^enabled\s*=/.test(line))?.slice(0, 96) ?? "",
      tomlBody,
      enabled: !tomlBody.split(/\r?\n/).some((line) => /^\s*enabled\s*=\s*false\s*(#.*)?$/i.test(line)),
    });
  };
  for (const line of contents.split(/\r?\n/)) {
    const path = tomlTablePathFromLine(line);
    if (path?.[0] === tableName && path.length >= 2) {
      const id = path[1];
      if (currentId === id && path.length > 2) {
        body.push(`[${path.slice(2).map(tomlKey).join(".")}]`);
        continue;
      }
      flush();
      currentId = id;
      body = [];
      continue;
    }
    if (currentId && /^\s*\[[^\]]+\]\s*$/.test(line)) {
      flush();
      currentId = null;
      body = [];
      continue;
    }
    if (currentId)
      body.push(line);
  }
  flush();
  return Array.from(entries.values());
}
function filterContextEntriesBySelection(entries: ContextEntries, selection: ContextSelection): ContextEntries {
  const selected = {
    mcp: new Set(selection.mcpServers.map((id) => id.trim()).filter(Boolean)),
    skill: new Set(selection.skills.map((id) => id.trim()).filter(Boolean)),
    plugin: new Set(selection.plugins.map((id) => id.trim()).filter(Boolean)),
  };
  return {
    mcpServers: entries.mcpServers.filter((entry) => selected.mcp.has(entry.id)),
    skills: entries.skills.filter((entry) => selected.skill.has(entry.id)),
    plugins: entries.plugins.filter((entry) => selected.plugin.has(entry.id)),
  };
}
function effectiveRelayConfigPreview(profile: RelayFileProfile, settings: RelayContextSettings, entries: ContextEntries): string {
  const isolatedConfig = stripContextEntriesFromConfig(profile.configContents, entries);
  const configWithLimits = applyContextLimitPreview(isolatedConfig, profile);
  return joinTomlSectionsRootFirst([configWithLimits, settings.relayCommonConfigContents || "", selectedContextConfigToml(entries)]);
}
function selectedContextConfigToml(entries: ContextEntries): string {
  const sections: string[] = [];
  for (const option of contextKinds) {
    for (const entry of entriesForKind(entries, option.kind)) {
      if (entry.enabled)
        sections.push(contextEntryToTomlSection(option.tableName, entry));
    }
  }
  return ensureTrailingNewline(sections.join("\n\n"));
}
function allContextConfigToml(entries: ContextEntries): string {
  const sections: string[] = [];
  for (const option of contextKinds)
    for (const entry of entriesForKind(entries, option.kind))
      sections.push(contextEntryToTomlSection(option.tableName, entry));
  return ensureTrailingNewline(sections.join("\n\n"));
}
function entriesForKind(entries: ContextEntries, kind: ContextKind): ContextEntry[] {
  const list = kind === "mcp" ? entries.mcpServers : kind === "skill" ? entries.skills : entries.plugins;
  return Array.from(new Map(list.map((entry) => [entry.id, entry])).values());
}
function contextEntryToTomlSection(tableName: string, entry: ContextEntry): string {
  const body = entry.tomlBody.trimEnd().split(/\r?\n/).map((line) => {
    const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    const subtable = match?.[1].trim();
    return subtable && !subtable.includes(".") ? `[${tableName}.${tomlKey(entry.id)}.${tomlKey(subtable)}]` : line;
  }).join("\n");
  return `[${tableName}.${tomlKey(entry.id)}]\n${body}`;
}
function relayCombinedCommonConfig(settings: RelayContextSettings): string {
  return joinTomlSectionsRootFirst([settings.relayCommonConfigContents || "", settings.relayContextConfigContents || ""]);
}
function splitContextConfigText(configContents: string): {
  common: string;
  context: string;
} {
  const entries = parseContextConfig(configContents);
  return { common: stripContextEntriesFromConfig(configContents, entries), context: allContextConfigToml(entries) };
}
function stripContextEntriesFromConfig(configContents: string, entries: ContextEntries): string {
  const knownIds = {
    mcp: new Set(entries.mcpServers.map((entry) => entry.id)),
    skill: new Set(entries.skills.map((entry) => entry.id)),
    plugin: new Set(entries.plugins.map((entry) => entry.id)),
  };
  const kept: string[] = [];
  let skipping = false;
  for (const line of configContents.split(/\r?\n/)) {
    const path = tomlTablePathFromLine(line);
    const option = path?.length === 2 ? contextKinds.find((item) => item.tableName === path[0]) : undefined;
    if (option && path)
      skipping = knownIds[option.kind].has(path[1]);
    else if (/^\s*\[[^\]]+\]\s*$/.test(line))
      skipping = false;
    if (!skipping)
      kept.push(line);
  }
  return ensureTrailingNewline(kept.join("\n").trimEnd());
}
function stripCommonConfigTextFallback(configContents: string, commonConfig: string): string {
  const rootKeys = new Set<string>();
  const tableHeaders = new Set<string>();
  let inRoot = true;
  for (const line of commonConfig.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      inRoot = false;
      tableHeaders.add(trimmed);
      continue;
    }
    if (inRoot) {
      const key = tomlRootKeyFromLine(trimmed);
      if (key)
        rootKeys.add(key);
    }
  }
  if (!rootKeys.size && !tableHeaders.size)
    return ensureTrailingNewline(configContents.trimEnd());
  const kept: string[] = [];
  let skippingTable = false;
  for (const line of configContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      skippingTable = tableHeaders.has(trimmed);
      if (skippingTable)
        continue;
    }
    if (skippingTable)
      continue;
    const key = tomlRootKeyFromLine(trimmed);
    if (!key || !rootKeys.has(key))
      kept.push(line);
  }
  return ensureTrailingNewline(kept.join("\n").trimEnd());
}
function applyContextLimitPreview(configContents: string, profile: RelayFileProfile): string {
  let lines = configContents.split(/\r?\n/);
  for (const [key, value] of [["model_context_window", profile.contextWindow], ["model_auto_compact_token_limit", profile.autoCompactLimit]]) {
    const trimmed = value.trim();
    if (!trimmed)
      continue;
    let replaced = false;
    lines = lines.map((line) => !replaced && new RegExp(`^\\s*${key}\\s*=`).test(line) ? (replaced = true, `${key} = ${trimmed}`) : line);
    if (!replaced) {
      const firstTable = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
      lines.splice(firstTable >= 0 ? firstTable : lines.length, 0, `${key} = ${trimmed}`);
    }
  }
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}
function joinTomlSections(sections: string[]): string {
  return ensureTrailingNewline(sections
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n"));
}
function joinTomlSectionsRootFirst(sections: string[]): string {
  const rootParts: string[] = [];
  const tableParts: string[] = [];
  for (const section of sections) {
    const { root, tables } = splitTomlRootAndTables(section);
    if (root.trim())
      rootParts.push(root.trim());
    if (tables.trim())
      tableParts.push(tables.trim());
  }
  return normalizeDuplicateTomlTables(joinTomlSections([...dedupeTomlRootLines(rootParts), ...tableParts]));
}
function normalizeDuplicateTomlTables(contents: string): string {
  const seenHeaders = new Set<string>();
  const kept: string[] = [];
  let skipping = false;
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      skipping = seenHeaders.has(trimmed);
      seenHeaders.add(trimmed);
      if (skipping)
        continue;
    }
    if (!skipping)
      kept.push(line);
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
      if (rootSeen.has(key))
        continue;
      rootSeen.add(key);
    }
    kept.push(line);
  }
  const normalized = kept.reverse().join("\n").trim();
  return normalized ? [normalized] : [];
}
function splitTomlRootAndTables(section: string): {
  root: string;
  tables: string;
} {
  const lines = section.trim().split(/\r?\n/);
  const firstTable = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
  if (firstTable < 0)
    return { root: lines.join("\n"), tables: "" };
  return {
    root: lines.slice(0, firstTable).join("\n"),
    tables: lines.slice(firstTable).join("\n"),
  };
}
function tomlRootKeyFromLine(line: string): string | null {
  if (!line || line.startsWith("#"))
    return null;
  const index = line.indexOf("=");
  return index < 0 ? null : line.slice(0, index).trim() || null;
}
function tomlTablePathFromLine(line: string): string[] | null {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  if (!match)
    return null;
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;
  for (const char of match[1].trim()) {
    if (quote) {
      if (quote === '"' && escaping) {
        current += char;
        escaping = false;
      }
      else if (quote === '"' && char === "\\")
        escaping = true;
      else if (char === quote)
        quote = null;
      else
        current += char;
    }
    else if (char === '"' || char === "'")
      quote = char;
    else if (char === ".") {
      if (!current.trim())
        return null;
      parts.push(current.trim());
      current = "";
    }
    else
      current += char;
  }
  if (quote || escaping || !current.trim())
    return null;
  parts.push(current.trim());
  return parts;
}
function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function ensureTrailingNewline(value: string): string {
  return value.trim() ? `${value}\n` : "";
}
