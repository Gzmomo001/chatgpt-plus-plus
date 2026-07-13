import type { BackendSettings } from "./contracts.ts";
import { stripNativeExtensionTables } from "../features/relay-profiles/config.ts";
import { normalizeRelaySettings } from "../features/relay-profiles/controller.ts";
import type {
  RelayMode,
  RelayProfile,
  RelayProtocol,
} from "../features/relay-profiles/types.ts";
import { t } from "../i18n/index.ts";

const emptyContextSelection = () => ({
  mcpServers: [],
  skills: [],
  plugins: [],
});

export const defaultSettings: BackendSettings = {
  codexAppPath: "",
  codexExtraArgs: [],
  providerSyncEnabled: false,
  providerSyncSavedProviders: [],
  providerSyncManualProviders: [],
  providerSyncLastSelectedProvider: "",
  relayProfilesEnabled: true,
  computerUseGuardEnabled: false,
  codexAppFastStartup: false,
  relayBaseUrl: "",
  relayApiKey: "",
  relayProfiles: [
    {
      id: "default",
      name: t("默认中转"),
      model: "",
      baseUrl: "",
      upstreamBaseUrl: "",
      apiKey: "",
      protocol: "responses",
      nativeImageGenerationEnabled: false,
      relayMode: "official",
      officialMixApiKey: false,
      testModel: "",
      configContents: "",
      authContents: "",
      useCommonConfig: true,
      contextSelection: emptyContextSelection(),
      contextSelectionInitialized: true,
      contextWindow: "",
      autoCompactLimit: "",
      modelList: "",
      modelWindows: "",
      userAgent: "",
    },
  ],
  relayCommonConfigContents: "",
  relayContextConfigContents: "",
  activeRelayId: "default",
  aggregateRelayProfiles: [],
  activeAggregateRelayId: "",
  relayTestModel: "gpt-5.4-mini",
};

export function normalizeSettings(settings: BackendSettings): BackendSettings {
  const relayCommonConfigContents = stripNativeExtensionTables(
    settings.relayCommonConfigContents || "",
  );
  const profiles = settings.relayProfiles?.length
    ? settings.relayProfiles.map((profile) => ({
        ...profile,
        configContents: stripNativeExtensionTables(profile.configContents || ""),
      }))
    : [
        {
          id: settings.activeRelayId || "default",
          name: t("默认中转"),
          model: "",
          baseUrl: settings.relayBaseUrl || defaultSettings.relayBaseUrl,
          upstreamBaseUrl: settings.relayBaseUrl || defaultSettings.relayBaseUrl,
          apiKey: settings.relayApiKey || "",
          protocol: "responses" as RelayProtocol,
          nativeImageGenerationEnabled: false,
          relayMode: "official" as RelayMode,
          officialMixApiKey: false,
          testModel: "",
          configContents: "",
          authContents: "",
          useCommonConfig: true,
          contextSelection: emptyContextSelection(),
          contextSelectionInitialized: true,
          contextWindow: "",
          autoCompactLimit: "",
          modelList: "",
          modelWindows: "",
          userAgent: "",
        },
      ];
  return normalizeRelaySettings(
    {
      ...defaultSettings,
      ...settings,
      relayProfilesEnabled: settings.relayProfilesEnabled !== false,
      computerUseGuardEnabled: settings.computerUseGuardEnabled === true,
      relayCommonConfigContents,
      relayContextConfigContents: "",
      relayProfiles: profiles,
      activeRelayId: settings.activeRelayId,
    },
    emptyContextSelection(),
  );
}

export function activeRelayProfile(settings: BackendSettings): RelayProfile {
  return (
    settings.relayProfiles.find((profile) => profile.id === settings.activeRelayId) ||
    settings.relayProfiles[0] ||
    defaultSettings.relayProfiles[0]
  );
}
