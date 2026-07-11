import type { ProviderPreset } from "../../presets";

import type { ApplyRelayProfilePresetIntent } from "./types";

export function createPresetIntent(
  preset: ProviderPreset,
): ApplyRelayProfilePresetIntent {
  return {
    type: "applyPreset",
    preset: {
      name: preset.name,
      baseUrl: preset.baseUrl,
      protocol: preset.protocol,
      model: preset.model,
      models: (preset.modelList ?? []).map((model) => ({ model, window: "" })),
      relayMode: preset.category === "official" ? "official" : "pureApi",
    },
  };
}
