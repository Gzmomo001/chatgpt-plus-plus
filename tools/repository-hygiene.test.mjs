import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const managerRoot = new URL("apps/chatgpt-plus-manager/", repositoryRoot);
const competingPackageManagerCommand = /(?:^|[\s;&|])(?:npm|npx|yarn|bun)(?=$|[\s;&|])/m;
const javascriptDependencyLockfiles = new Set([
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

function hasCompetingPackageManagerCommand(source) {
  return competingPackageManagerCommand.test(source);
}

function dependencyLockfiles(entries) {
  return entries.filter((entry) => javascriptDependencyLockfiles.has(entry)).sort();
}

test("recognizes competing package-manager command fixtures", () => {
  for (const command of [
    "npm i",
    "npm install",
    "npm add example",
    "npx example",
    "yarn install",
    "bun install",
    "corepack yarn install",
  ]) {
    assert.equal(hasCompetingPackageManagerCommand(command), true, command);
  }
  for (const command of ["pnpm install", "pnpm dlx example", "cargo test"]) {
    assert.equal(hasCompetingPackageManagerCommand(command), false, command);
  }
});

test("recognizes every supported JavaScript dependency lockfile fixture", () => {
  assert.deepEqual(
    dependencyLockfiles([
      "package.json",
      "package-lock.json",
      "npm-shrinkwrap.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lock",
      "bun.lockb",
      "Cargo.lock",
    ]),
    [
      "bun.lock",
      "bun.lockb",
      "npm-shrinkwrap.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
    ],
  );
});

test("pnpm is the manager's only dependency-install contract", () => {
  const manifest = JSON.parse(readFileSync(new URL("package.json", managerRoot), "utf8"));

  assert.equal(manifest.packageManager, "pnpm@10.33.0");
  assert.equal(hasCompetingPackageManagerCommand(Object.values(manifest.scripts).join("\n")), false);
  assert.deepEqual(
    dependencyLockfiles(readdirSync(managerRoot)),
    ["pnpm-lock.yaml"],
    "pnpm-lock.yaml must be the manager's only JavaScript dependency lockfile",
  );

  const workflowRoot = new URL(".github/workflows/", repositoryRoot);
  const workflows = readdirSync(workflowRoot)
    .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
    .map((entry) => readFileSync(new URL(entry, workflowRoot), "utf8"))
    .join("\n");

  assert.match(workflows, /pnpm install --frozen-lockfile/);
  assert.equal(hasCompetingPackageManagerCommand(workflows), false);
});

test("deep-module ownership and removed compatibility surfaces are documented", () => {
  const architecturePath = new URL("docs/architecture/deep-modules.md", repositoryRoot);

  assert.equal(existsSync(architecturePath), true);
  const architecture = readFileSync(architecturePath, "utf8");

  for (const contract of [
    "Relay profile editor",
    "open / edit / commit",
    "Codex home mutation",
    "reconcile / activate",
    "Settings facade",
    "Tauri command domains",
    "Protocol transaction seam",
    "manager-owned launch runtime",
    "Manager Zed Remote",
    "upstream-worktree",
    "removed end to end",
    "unknown fields",
    "Deletion test",
  ]) {
    assert.match(
      architecture,
      new RegExp(contract, "i"),
      `missing architecture contract: ${contract}`,
    );
  }
});
