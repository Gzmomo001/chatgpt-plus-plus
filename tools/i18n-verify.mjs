// Verifies the English dictionary (src/i18n/english.ts) covers exactly the keys that
// are actually referenced by t("…") / tf("…") calls in the frontend source — no
// missing keys, no stale extras. Scanning real call sites (rather than trusting
// tools/i18n-keys.json) means hand-added wrapped strings are validated too, not
// just the codemod's output.
//
// Run after editing the dictionary, adding a t()/tf() call, or re-running the
// codemod:
//   node tools/i18n-verify.mjs

import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { auditCatalog } from "./i18n-verify-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const appRoot = path.join(repoRoot, "apps", "chatgpt-plus-manager");
const require = createRequire(path.join(appRoot, "package.json"));
const ts = require("typescript");

const SRC_FILES = readdirSync(path.join(appRoot, "src"), { recursive: true })
  .filter(
    (entry) =>
      typeof entry === "string" &&
      /\.(?:ts|tsx)$/.test(entry) &&
      !/\.test\.(?:ts|tsx)$/.test(entry) &&
      entry !== path.join("i18n", "english.ts"),
  )
  .map((entry) => path.join("src", entry));

// ── Collect the keys referenced by t()/tf() across the source. ──────────────
const usedPlain = new Set();
const usedTemplate = new Set();
const productionIdentifierCounts = new Map();
const dynamicConstants = new Map();
const dynamicPlainKeys = new Set();
const dynamicTemplateKeys = new Set();
let hasDynamicPlainCall = false;
let hasDynamicTemplateCall = false;

function scanFile(relPath) {
  const abs = path.join(appRoot, relPath);
  const text = readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const isDynamicManifest = relPath === path.join("src", "i18n", "dynamic-keys.ts");

  const visit = (node) => {
    const variableInitializer =
      ts.isVariableDeclaration(node) && node.initializer && ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : ts.isVariableDeclaration(node)
          ? node.initializer
          : null;
    if (!isDynamicManifest && ts.isIdentifier(node)) {
      productionIdentifierCounts.set(node.text, (productionIdentifierCounts.get(node.text) ?? 0) + 1);
    }
    if (
      isDynamicManifest &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name)
    ) {
      if (ts.isStringLiteral(variableInitializer) || ts.isNoSubstitutionTemplateLiteral(variableInitializer)) {
        if (/^DYNAMIC_(?:PLAIN|TEMPLATE)_/.test(node.name.text)) {
          dynamicConstants.set(node.name.text, variableInitializer.text);
        }
      } else if (ts.isArrayLiteralExpression(variableInitializer)) {
        const target =
          node.name.text === "DYNAMIC_PLAIN_KEYS"
            ? dynamicPlainKeys
            : node.name.text === "DYNAMIC_TEMPLATE_KEYS"
              ? dynamicTemplateKeys
              : null;
        if (target) {
          for (const element of variableInitializer.elements) {
            if (ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)) {
              target.add(element.text);
            } else if (ts.isIdentifier(element) && dynamicConstants.has(element.text)) {
              target.add(dynamicConstants.get(element.text));
            }
          }
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fn = node.expression.text;
      const arg = node.arguments[0];
      const literal =
        arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) ? arg.text : null;
      if (literal !== null) {
        if (fn === "t") usedPlain.add(literal);
        else if (fn === "tf") usedTemplate.add(literal);
      } else if (fn === "t") {
        hasDynamicPlainCall = true;
      } else if (fn === "tf") {
        hasDynamicTemplateCall = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

for (const f of SRC_FILES) scanFile(f);

// ── Read the dictionary keys out of i18n/english.ts. ────────────────────────
const dictSource = readFileSync(path.join(appRoot, "src", "i18n", "english.ts"), "utf8");

function recordKeys(varName) {
  const re = new RegExp(`export const ${varName}\\s*:\\s*Record<string,\\s*string>\\s*=\\s*\\{`);
  const match = re.exec(dictSource);
  if (!match) throw new Error(`Could not find ${varName} in i18n/english.ts`);
  const start = match.index + match[0].length - 1; // position of "{"
  let depth = 0;
  let i = start;
  let inStr = null;
  let escaped = false;
  for (; i < dictSource.length; i++) {
    const ch = dictSource[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  const literal = dictSource.slice(start, i);
  // eslint-disable-next-line no-eval
  const obj = (0, eval)(`(${literal})`);
  return new Set(Object.keys(obj));
}

let ok = true;

function check(label, directKeys, dynamicManifestKeys, dynamicProducerKeys, hasDynamicCall, dictSet) {
  const result = auditCatalog({
    directKeys,
    dynamicManifestKeys,
    dynamicProducerKeys,
    catalogKeys: dictSet,
    hasDynamicCall,
  });
  console.log(`${label}: ${result.expectedKeys.size} referenced, ${dictSet.size} translated`);
  if (result.missingDynamicManifest) {
    ok = false;
    console.log(`  DYNAMIC ${label.toUpperCase()} CALLS REQUIRE A MANIFEST`);
  }
  if (result.orphanedDynamicKeys.length) {
    ok = false;
    console.log(`  ORPHANED DYNAMIC KEYS (${result.orphanedDynamicKeys.length}):`);
    for (const key of result.orphanedDynamicKeys) console.log(`    ${JSON.stringify(key)}`);
  }
  if (result.unregisteredDynamicProducers.length) {
    ok = false;
    console.log(`  UNREGISTERED DYNAMIC PRODUCERS (${result.unregisteredDynamicProducers.length}):`);
    for (const key of result.unregisteredDynamicProducers) console.log(`    ${JSON.stringify(key)}`);
  }
  if (result.missing.length) {
    ok = false;
    console.log(`  MISSING from dictionary (${result.missing.length}):`);
    for (const key of result.missing) console.log(`    ${JSON.stringify(key)}`);
  }
  if (result.extra.length) {
    ok = false;
    console.log(`  STALE in dictionary (${result.extra.length}):`);
    for (const key of result.extra) console.log(`    ${JSON.stringify(key)}`);
  }
}

const dynamicPlainProducers = new Set();
const dynamicTemplateProducers = new Set();
for (const [name, key] of dynamicConstants) {
  if ((productionIdentifierCounts.get(name) ?? 0) < 2) continue;
  if (name.startsWith("DYNAMIC_PLAIN_")) dynamicPlainProducers.add(key);
  else if (name.startsWith("DYNAMIC_TEMPLATE_")) dynamicTemplateProducers.add(key);
}

check("plain", usedPlain, dynamicPlainKeys, dynamicPlainProducers, hasDynamicPlainCall, recordKeys("EN_PLAIN"));
check("template", usedTemplate, dynamicTemplateKeys, dynamicTemplateProducers, hasDynamicTemplateCall, recordKeys("EN_TEMPLATE"));

if (!ok) {
  console.error("\nDictionary does not match t()/tf() usage in source.");
  process.exit(1);
}
console.log("\nDictionary matches every t()/tf() call site exactly.");
