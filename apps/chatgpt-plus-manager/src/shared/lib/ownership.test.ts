import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const managerRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const legacyUtilsPath = path.join(managerRoot, "src/lib/utils.ts");
const sharedUtilsPath = path.join(managerRoot, "src/shared/lib/utils.ts");

test("shared lib owns utils without a legacy forwarding path", () => {
  assert.equal(existsSync(sharedUtilsPath), true, "src/shared/lib/utils.ts must own cn");
  assert.equal(existsSync(legacyUtilsPath), false, "src/lib/utils.ts must be removed");
});

test("generator aliases target shared lib ownership", () => {
  const componentsConfig = JSON.parse(
    readFileSync(path.join(managerRoot, "components.json"), "utf8"),
  ) as { aliases?: Record<string, string> };

  assert.equal(componentsConfig.aliases?.utils, "@/shared/lib/utils");
  assert.equal(componentsConfig.aliases?.lib, "@/shared/lib");
  assert.equal(JSON.stringify(componentsConfig).includes("@/lib"), false);
});

test("shared utils preserves the cn public export and behavior", async () => {
  assert.equal(existsSync(sharedUtilsPath), true, "shared utils module must exist before import");

  const utils = await import(pathToFileURL(sharedUtilsPath).href);
  assert.deepEqual(Object.keys(utils).sort(), ["cn"]);
  assert.equal(utils.cn("px-2", false && "hidden", "px-4"), "px-4");
});
