import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
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
const frontendBuildOnlyDependencies = [
  "@tauri-apps/cli",
  "typescript",
  "vite",
];

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

test("frontend build tooling stays out of production dependencies", () => {
  const manifest = JSON.parse(readFileSync(new URL("package.json", managerRoot), "utf8"));

  for (const dependency of frontendBuildOnlyDependencies) {
    assert.equal(
      Object.hasOwn(manifest.dependencies, dependency),
      false,
      `${dependency} is build-only and must not be installed as a production dependency`,
    );
    assert.equal(
      Object.hasOwn(manifest.devDependencies, dependency),
      true,
      `${dependency} must remain available to development and release builds`,
    );
  }
});

test("release version script accepts a Windows CRLF Cargo.lock", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "chatgpt-plus-plus-release-version-"));
  try {
    mkdirSync(join(fixtureRoot, "apps/chatgpt-plus-manager/src-tauri"), {
      recursive: true,
    });
    writeFileSync(
      join(fixtureRoot, "Cargo.toml"),
      '[workspace.package]\nversion = "1.2.35"\n',
    );
    writeFileSync(
      join(fixtureRoot, "apps/chatgpt-plus-manager/package.json"),
      '{\n  "version": "1.2.35"\n}\n',
    );
    writeFileSync(
      join(fixtureRoot, "apps/chatgpt-plus-manager/src-tauri/tauri.conf.json"),
      '{\n  "version": "1.2.35"\n}\n',
    );
    writeFileSync(
      join(fixtureRoot, "Cargo.lock"),
      ["chatgpt-plus-core", "chatgpt-plus-data", "chatgpt-plus-manager"]
        .map(
          (name) =>
            `[[package]]\r\nname = "${name}"\r\nversion = "1.2.35"\r\n`,
        )
        .join("\r\n"),
    );

    const output = execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("scripts/release/set-version.mjs", repositoryRoot)),
        "1.2.36",
        "--dry-run",
      ],
      { cwd: fixtureRoot, encoding: "utf8" },
    );

    assert.match(output, /Would set version 1\.2\.35 -> 1\.2\.36/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
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
