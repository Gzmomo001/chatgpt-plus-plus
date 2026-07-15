import { isTauri } from "@tauri-apps/api/core";
import { writeText as writeNativeClipboardText } from "@tauri-apps/plugin-clipboard-manager";

export type ClipboardTextWriters = {
  isNativeApp: () => boolean;
  writeNative: (text: string) => Promise<void>;
  writeWeb: (text: string) => Promise<void>;
};

const defaultClipboardTextWriters: ClipboardTextWriters = {
  isNativeApp: isTauri,
  writeNative: writeNativeClipboardText,
  writeWeb: (text) => navigator.clipboard.writeText(text),
};

export async function writeTextToClipboard(
  text: string,
  { isNativeApp, writeNative, writeWeb } = defaultClipboardTextWriters,
): Promise<void> {
  if (isNativeApp()) {
    await writeNative(text);
    return;
  }
  await writeWeb(text);
}
