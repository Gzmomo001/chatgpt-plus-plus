import type { BackendSettings } from "./contracts.ts";
import {
  normalizeContextSettings,
  readContextCatalog,
} from "../features/context/config.ts";
import { normalizeRelaySettings } from "../features/relay-profiles/controller.ts";
import type {
  RelayMode,
  RelayProfile,
  RelayProtocol,
} from "../features/relay-profiles/types.ts";
import { t } from "../i18n/index.ts";
import {
  clampNumber,
  normalizeImageOverlayFitMode,
} from "../shared/lib/settings.ts";

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
  enhancementsEnabled: true,
  computerUseGuardEnabled: false,
  codexAppPluginMarketplaceUnlock: true,
  codexAppPluginAutoExpand: true,
  codexAppModelWhitelistUnlock: true,
  codexAppSessionDelete: true,
  codexAppMarkdownExport: true,
  codexAppPasteFix: false,
  codexAppForceChineseLocale: true,
  codexAppFastStartup: false,
  codexAppProjectMove: true,
  codexAppThreadIdBadge: false,
  codexAppConversationView: false,
  codexAppThreadScrollRestore: true,
  codexAppUpstreamWorktreeCreate: true,
  codexAppNativeMenuPlacement: true,
  codexAppNativeMenuLocalization: true,
  codexAppServiceTierControls: false,
  codexAppStepwiseEnabled: false,
  codexAppStepwiseDirectSend: false,
  codexAppStepwiseBaseUrl: "",
  codexAppStepwiseApiKey: "",
  codexAppStepwiseApiKeyEnv: "CODEX_STEPWISE_API_KEY",
  codexAppStepwiseModel: "",
  codexAppStepwiseMaxItems: 6,
  codexAppStepwiseMaxInputChars: 6000,
  codexAppStepwiseMaxOutputTokens: 500,
  codexAppStepwiseTimeoutMs: 8000,
  codexAppImageOverlayEnabled: false,
  codexAppImageOverlayPath: "",
  codexAppImageOverlayOpacity: 35,
  codexAppImageOverlayFitMode: "fit",
  codexGoalsEnabled: false,
  launchMode: "patch",
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
  const { relayCommonConfigContents, relayContextConfigContents } = normalizeContextSettings(
    settings.relayCommonConfigContents || "",
    settings.relayContextConfigContents || "",
  );
  const defaultContextSelection = readContextCatalog({
    relayContextConfigContents,
  }).defaultSelection;
  const profiles = settings.relayProfiles?.length
    ? settings.relayProfiles
    : [
        {
          id: settings.activeRelayId || "default",
          name: t("默认中转"),
          model: "",
          baseUrl: settings.relayBaseUrl || defaultSettings.relayBaseUrl,
          upstreamBaseUrl: settings.relayBaseUrl || defaultSettings.relayBaseUrl,
          apiKey: settings.relayApiKey || "",
          protocol: "responses" as RelayProtocol,
          relayMode: "official" as RelayMode,
          officialMixApiKey: false,
          testModel: "",
          configContents: "",
          authContents: "",
          useCommonConfig: true,
          contextSelection: defaultContextSelection,
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
      codexAppImageOverlayOpacity: clampNumber(
        settings.codexAppImageOverlayOpacity || 35,
        1,
        100,
      ),
      codexAppImageOverlayFitMode: normalizeImageOverlayFitMode(
        settings.codexAppImageOverlayFitMode,
      ),
      codexAppStepwiseMaxItems: clampNumber(settings.codexAppStepwiseMaxItems ?? 6, 0, 6),
      codexAppStepwiseMaxInputChars: clampNumber(
        settings.codexAppStepwiseMaxInputChars || 6000,
        1000,
        24000,
      ),
      codexAppStepwiseMaxOutputTokens: clampNumber(
        settings.codexAppStepwiseMaxOutputTokens || 500,
        100,
        4000,
      ),
      codexAppStepwiseTimeoutMs: clampNumber(
        settings.codexAppStepwiseTimeoutMs || 8000,
        1000,
        60000,
      ),
      relayCommonConfigContents,
      relayContextConfigContents,
      relayProfiles: profiles,
      activeRelayId: settings.activeRelayId,
    },
    defaultContextSelection,
  );
}

export function activeRelayProfile(settings: BackendSettings): RelayProfile {
  return (
    settings.relayProfiles.find((profile) => profile.id === settings.activeRelayId) ||
    settings.relayProfiles[0] ||
    defaultSettings.relayProfiles[0]
  );
}
