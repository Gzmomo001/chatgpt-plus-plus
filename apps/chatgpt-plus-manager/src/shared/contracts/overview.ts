import type { CommandResult } from "./command";

export type PathState = {
  status: string;
  path: string | null;
};

export type LaunchStatus = {
  status: string;
  message: string;
  startedAtMs: number;
  protocolProxyPort: number | null;
  codexApp: string | null;
};

export type OverviewResult = CommandResult<{
  codexApp: PathState;
  codexVersion: string | null;
  appShortcut: PathState;
  latestLaunch: LaunchStatus | null;
  currentVersion: string;
  updateStatus: string;
  settingsPath: string;
  logsPath: string;
}>;
