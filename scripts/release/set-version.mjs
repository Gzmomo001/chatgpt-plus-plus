import fs from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const nextVersion = args.find((argument) => argument !== "--dry-run");

if (!nextVersion || !/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  throw new Error(
    "Usage: node scripts/release/set-version.mjs X.Y.Z [--dry-run]",
  );
}

const targets = [
  {
    file: "Cargo.toml",
    pattern: /^version[ \t]*=[ \t]*"(\d+\.\d+\.\d+)"[ \t]*$/m,
  },
  {
    file: "apps/chatgpt-plus-manager/package.json",
    pattern: /^[ \t]*"version"[ \t]*:[ \t]*"(\d+\.\d+\.\d+)"[ \t]*,?[ \t]*$/m,
  },
  {
    file: "apps/chatgpt-plus-manager/src-tauri/tauri.conf.json",
    pattern: /^[ \t]*"version"[ \t]*:[ \t]*"(\d+\.\d+\.\d+)"[ \t]*,?[ \t]*$/m,
  },
];

const contents = targets.map((target) => ({
  ...target,
  text: fs.readFileSync(target.file, "utf8"),
}));

const versions = contents.map((target) => {
  const match = target.text.match(target.pattern);
  if (!match) {
    throw new Error(`Could not find a semver version in ${target.file}`);
  }
  return match[1];
});

if (new Set(versions).size !== 1) {
  throw new Error(`Version files disagree: ${versions.join(", ")}`);
}

const lockFile = "Cargo.lock";
const lockText = fs.readFileSync(lockFile, "utf8");
const lockPattern =
  /(\[\[package\]\]\r?\nname = "(?:chatgpt-plus-core|chatgpt-plus-data|chatgpt-plus-manager)"\r?\nversion = ")(\d+\.\d+\.\d+)(")/g;
const lockMatches = [...lockText.matchAll(lockPattern)];
const lockVersions = lockMatches.map((match) => match[2]);

if (lockMatches.length !== 3 || new Set(lockVersions).size !== 1) {
  throw new Error(
    `Cargo.lock package versions disagree: ${lockVersions.join(", ")}`,
  );
}

if (lockVersions[0] !== versions[0]) {
  throw new Error(
    `Cargo.lock version ${lockVersions[0]} disagrees with ${versions[0]}`,
  );
}

for (const target of contents) {
  const updated = target.text.replace(target.pattern, (line, currentVersion) =>
    line.replace(currentVersion, nextVersion),
  );
  if (!dryRun) {
    fs.writeFileSync(target.file, updated);
  }
}

const updatedLock = lockText.replace(
  lockPattern,
  (_match, prefix, _currentVersion, suffix) =>
    `${prefix}${nextVersion}${suffix}`,
);
if (!dryRun) {
  fs.writeFileSync(lockFile, updatedLock);
}

console.log(
  `${dryRun ? "Would set" : "Set"} version ${versions[0]} -> ${nextVersion}`,
);
