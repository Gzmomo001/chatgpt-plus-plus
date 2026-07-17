import type {
  AggregateRelayProfile,
  RelayProfile,
} from "@/features/relay-profiles/types";
import type { EnvConflictsResult } from "@/features/relay-profiles/contracts";
import type { CommandResult } from "@/shared/contracts/command";

export type {
  CcsProvidersResult,
  EnvConflictsResult,
  ExtractRelayCommonConfigResult,
  ProviderDoctorResult,
  RelayFilesResult,
  RelayProfileView,
} from "@/features/relay-profiles/contracts";
export type { CommandResult, Status } from "@/shared/contracts/command";

export type BackendSettings = {
  codexAppPath: string;
  codexExtraArgs: string[];
  diagnosticLogEnabled: boolean;
  providerSyncSavedProviders: string[];
  providerSyncManualProviders: string[];
  providerSyncLastSelectedProvider: string;
  computerUseGuardEnabled: boolean;
  codexAppFastStartup: boolean;
  relayBaseUrl: string;
  relayApiKey: string;
  relayProfiles: RelayProfile[];
  aggregateRelayProfiles: AggregateRelayProfile[];
  activeAggregateRelayId: string;
  relayCommonConfigContents: string;
  relayContextConfigContents: string;
  activeRelayId: string;
};
export type SettingsResult = CommandResult<{
  settings: BackendSettings;
  settingsPath: string;
}>;
export type PreferenceSettings = Pick<
  BackendSettings,
  "codexExtraArgs" | "diagnosticLogEnabled"
>;

export type EnvConflict = EnvConflictsResult["conflicts"][number];
