import type { ContextEntries, ContextEntry, ContextKind } from "@/features/context/config";
import type {
  AggregateRelayProfile,
  RelayProfile,
} from "@/features/relay-profiles/types";
import type { EnvConflictsResult } from "@/features/relay-profiles/contracts";
import type { CommandResult } from "@/shared/contracts/command";
import type { ImageOverlayFitMode } from "@/shared/contracts/settings";

export type {
  CcsProvidersResult,
  EnvConflictsResult,
  ExtractRelayCommonConfigResult,
  ProviderDoctorResult,
  RelayFilesResult,
  RelayProfileView,
} from "@/features/relay-profiles/contracts";
export type { CommandResult, Status } from "@/shared/contracts/command";
export type {
  ContextEntries as CodexContextEntries,
  ContextEntry as CodexContextEntry,
  ContextKind,
};

export type ZedOpenStrategy = "addToFocusedWorkspace" | "reuseWindow" | "newWindow" | "default";
export type LaunchMode = "patch" | "relay";
export type { ImageOverlayFitMode } from "@/shared/contracts/settings";
export type BackendSettings = {
  codexAppPath: string;
  codexExtraArgs: string[];
  providerSyncEnabled: boolean;
  providerSyncSavedProviders: string[];
  providerSyncManualProviders: string[];
  providerSyncLastSelectedProvider: string;
  relayProfilesEnabled: boolean;
  enhancementsEnabled: boolean;
  computerUseGuardEnabled: boolean;
  codexAppPluginMarketplaceUnlock: boolean;
  codexAppPluginAutoExpand: boolean;
  codexAppModelWhitelistUnlock: boolean;
  codexAppSessionDelete: boolean;
  codexAppMarkdownExport: boolean;
  codexAppPasteFix: boolean;
  codexAppForceChineseLocale: boolean;
  codexAppFastStartup: boolean;
  codexAppProjectMove: boolean;
  codexAppThreadIdBadge: boolean;
  codexAppConversationView: boolean;
  codexAppThreadScrollRestore: boolean;
  codexAppZedRemoteOpen: boolean;
  zedRemoteOpenStrategy: ZedOpenStrategy;
  zedRemoteProjectRegistryEnabled: boolean;
  zedRemoteSyncToZedSettings: boolean;
  codexAppUpstreamWorktreeCreate: boolean;
  codexAppNativeMenuPlacement: boolean;
  codexAppNativeMenuLocalization: boolean;
  codexAppServiceTierControls: boolean;
  codexAppStepwiseEnabled: boolean;
  codexAppStepwiseDirectSend: boolean;
  codexAppStepwiseBaseUrl: string;
  codexAppStepwiseApiKey: string;
  codexAppStepwiseApiKeyEnv: string;
  codexAppStepwiseModel: string;
  codexAppStepwiseMaxItems: number;
  codexAppStepwiseMaxInputChars: number;
  codexAppStepwiseMaxOutputTokens: number;
  codexAppStepwiseTimeoutMs: number;
  codexAppImageOverlayEnabled: boolean;
  codexAppImageOverlayPath: string;
  codexAppImageOverlayOpacity: number;
  codexAppImageOverlayFitMode: ImageOverlayFitMode;
  codexGoalsEnabled: boolean;
  launchMode: LaunchMode;
  relayBaseUrl: string;
  relayApiKey: string;
  relayProfiles: RelayProfile[];
  aggregateRelayProfiles: AggregateRelayProfile[];
  activeAggregateRelayId: string;
  relayCommonConfigContents: string;
  relayContextConfigContents: string;
  activeRelayId: string;
  relayTestModel: string;
};
export type UserScriptInventory = {
  enabled?: boolean;
  scripts?: Array<{
    key: string;
    name: string;
    source: string;
    enabled: boolean;
    status: string;
    error: string;
    market_id?: string;
    version?: string;
    installed?: boolean;
    source_url?: string;
    homepage?: string;
  }>;
};

export type SettingsResult = CommandResult<{
  settings: BackendSettings;
  settings_path: string;
  user_scripts: UserScriptInventory;
}>;

export type EnvConflict = EnvConflictsResult["conflicts"][number];
