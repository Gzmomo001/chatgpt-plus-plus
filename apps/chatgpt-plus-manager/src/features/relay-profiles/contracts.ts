import type {
  DeepReadonly,
  RelayProfile,
  RelayProfileSettings,
  RelayProtocol,
  ReconciledRelayProfileSettings,
} from "./types";
import type { ContextEntries } from "@/features/context/config";
import type { CommandResult, Status } from "@/shared/contracts/command";
export type { CommandResult, Status } from "@/shared/contracts/command";
export type RelayProfileView = DeepReadonly<RelayProfile>;
export type RelayFilesResult = CommandResult<{
  configPath: string;
  authPath: string;
  configContents: string;
  authContents: string;
}>;
export type ProviderDoctorResult = CommandResult<{
  profileName: string;
  model: string;
  summary: string;
  recommendation: string;
  checks: Array<{
    id: string;
    title: string;
    status: Status;
    detail: string;
  }>;
}>;
export type CcsProvidersResult = CommandResult<{
  dbPath: string;
  providers: Array<{
    sourceId: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    protocol: RelayProtocol;
    configContents: string;
    authContents: string;
  }>;
}>;
export type EnvConflictsResult = CommandResult<{
  conflicts: Array<{
    name: string;
    source: "process" | "user" | string;
    valuePresent: boolean;
  }>;
}>;
export type ExtractRelayCommonConfigResult = CommandResult<{
  commonConfigContents: string;
  profileConfigContents: string;
}>;
export type RelayContextEntries = ContextEntries;
export type RelaySettings = RelayProfileSettings & {
  relayProfilesEnabled: boolean;
  relayCommonConfigContents: string;
  relayContextConfigContents: string;
  relayTestModel: string;
};
export type RelayProfileActions<Settings extends RelaySettings> = {
  saveSettingsValue: (
    settings: ReconciledRelayProfileSettings<Settings>,
    silent?: boolean,
  ) => Promise<void>;
  refreshRelayFiles: () => Promise<RelayFilesResult | null>;
  refreshEnvConflicts: (silent?: boolean) => Promise<EnvConflictsResult | null>;
  removeEnvConflicts: (names: string[]) => Promise<void>;
  refreshCcsProviders: (silent?: boolean) => Promise<CcsProvidersResult | null>;
  importCcsProviders: () => Promise<void>;
  testRelayProfile: (profile: RelayProfileView) => Promise<void>;
  diagnoseRelayProfile: (profile: RelayProfileView) => Promise<ProviderDoctorResult | null>;
  fetchRelayProfileModels: (profile: RelayProfileView) => Promise<string[] | null>;
  switchRelayProfile: (
    settings: ReconciledRelayProfileSettings<Settings>,
    targetRelayId: string,
  ) => Promise<void>;
  relaySwitching: boolean;
  extractRelayCommonConfig: (configContents: string) => Promise<ExtractRelayCommonConfigResult | null>;
  showMessage: (title: string, message: string, status?: Status) => Promise<void>;
};
export type RelayProfileFilesActions<Settings extends RelaySettings> = Pick<
  RelayProfileActions<Settings>,
  "extractRelayCommonConfig" | "saveSettingsValue" | "showMessage"
>;
