// Lightweight source-text-keyed i18n for the ChatGPT++ manager UI.
//
// The app is authored in Chinese. Every user-facing Chinese literal is wrapped
// with `t("中文")` (plain strings) or `tf("前缀 {0}", [expr])` (interpolated
// strings) by tools/i18n-codemod.mjs. When the active language is English we
// look the source text up in the English dictionary; otherwise we return the
// original Chinese, so Chinese stays the zero-overhead default.
//
// Language is kept as a small external store so React can re-render the
// existing window in place. Translations must be resolved at render/call time;
// module-level translated constants will otherwise keep the old language.

import { EN_BACKEND, EN_BACKEND_PATTERNS, EN_PLAIN, EN_TEMPLATE } from "./english.ts";
import { useSyncExternalStore } from "react";

export type Language = "zh" | "en";

const STORAGE_KEY = "chatgpt-plus-lang";
const LEGACY_STORAGE_KEY = "codex-plus-lang";

function resolveInitialLanguage(): Language {
  try {
    const stored =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return stored === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

let currentLanguage: Language = resolveInitialLanguage();
const languageListeners = new Set<() => void>();

export function getLanguage(): Language {
  return currentLanguage;
}

export function subscribeToLanguage(listener: () => void): () => void {
  languageListeners.add(listener);
  return () => languageListeners.delete(listener);
}

/** Subscribe a React component to in-place language changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeToLanguage, getLanguage, getLanguage);
}

/** Translate a plain Chinese literal. Falls back to the source text. */
export function t(zh: string): string {
  if (currentLanguage !== "en") return zh;
  const plain = EN_PLAIN[zh] ?? EN_BACKEND[zh];
  if (plain) return plain;
  for (const [re, replacement] of EN_BACKEND_PATTERNS) {
    if (re.test(zh)) return zh.replace(re, replacement);
  }
  return zh;
}

/**
 * Translate an interpolated literal. `key` carries `{0}`,`{1}`… placeholders in
 * the original (Chinese) order; `args` are the runtime values for each. In
 * Chinese we substitute into the key itself; in English we substitute into the
 * looked-up template (also falling back to the key).
 */
export function tf(key: string, args: Array<string | number>): string {
  const template = currentLanguage === "en" ? EN_TEMPLATE[key] ?? key : key;
  return template.replace(/\{(\d+)\}/g, (match, index) => {
    const value = args[Number(index)];
    return value === undefined || value === null ? match : String(value);
  });
}

/** Persist a new language and notify the existing webview without reloading it. */
export function setLanguage(language: Language): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Ignore storage failures; the current window can still switch in place.
  }
  if (currentLanguage === language) return;
  currentLanguage = language;
  for (const listener of languageListeners) listener();
}

/** Flip between Chinese and English. */
export function toggleLanguage(): void {
  setLanguage(currentLanguage === "en" ? "zh" : "en");
}
