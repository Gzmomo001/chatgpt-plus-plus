import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const rootEntry = new URL("../i18n.ts", import.meta.url);
const rootEnglish = new URL("../i18n-en.ts", import.meta.url);
const facade = new URL("./index.ts", import.meta.url);
const english = new URL("./english.ts", import.meta.url);

test("i18n is owned by the i18n directory without legacy forwarding files", () => {
  assert.equal(existsSync(facade), true, "the i18n directory must own the public facade");
  assert.equal(existsSync(english), true, "the i18n directory must own the English catalog");
  assert.equal(existsSync(rootEntry), false, "the old root entry must be removed");
  assert.equal(existsSync(rootEnglish), false, "the old root English catalog must be removed");

  const facadeSource = readFileSync(facade, "utf8");
  assert.match(facadeSource, /from ["']\.\/english\.ts["']/);
  assert.doesNotMatch(facadeSource, /i18n-en/);
});

test("the facade preserves language selection, translation fallback, and persistence", async () => {
  const originalWindow = globalThis.window;
  let storedLanguage: string | null = "en";
  let reloads = 0;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return key === "chatgpt-plus-lang" ? storedLanguage : null;
        },
        setItem(key: string, value: string) {
          assert.equal(key, "chatgpt-plus-lang");
          storedLanguage = value;
        },
      },
      location: {
        reload() {
          reloads += 1;
        },
      },
    },
  });

  try {
    const i18n = await import(`./index.ts?ownership=${Date.now()}`);
    assert.equal(i18n.getLanguage(), "en");
    assert.equal(i18n.t("供应商"), "Provider");
    assert.equal(i18n.t("保存设置失败：boom"), "Failed to save settings: boom");
    assert.equal(i18n.t("没有对应英文的文本"), "没有对应英文的文本");
    assert.equal(i18n.tf("供应商 {0}", [3]), "Provider 3");

    i18n.setLanguage("zh");
    assert.equal(storedLanguage, "zh");
    assert.equal(reloads, 1);

    i18n.toggleLanguage();
    assert.equal(storedLanguage, "zh");
    assert.equal(reloads, 2);
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  }
});

test("every explicitly dynamic translation key is present in the English catalog", async () => {
  const [{ DYNAMIC_PLAIN_KEYS, DYNAMIC_TEMPLATE_KEYS }, catalog] = await Promise.all([
    import("./dynamic-keys.ts"),
    import("./english.ts"),
  ]);

  for (const key of DYNAMIC_PLAIN_KEYS) {
    assert.equal(Object.hasOwn(catalog.EN_PLAIN, key), true, `missing dynamic plain key: ${key}`);
  }
  for (const key of DYNAMIC_TEMPLATE_KEYS) {
    assert.equal(Object.hasOwn(catalog.EN_TEMPLATE, key), true, `missing dynamic template key: ${key}`);
  }
});
