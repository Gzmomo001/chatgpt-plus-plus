import { commit, open } from "./editor.ts";
import type {
  RelayContextSelection,
  RelayProfileCommitResult,
  RelayProfileEditorState,
  RelayProfileSettings,
  ReconciledRelayProfileSettings,
} from "./types.ts";

type ConcreteCommitResult<Settings extends RelayProfileSettings> =
  | (Omit<Extract<RelayProfileCommitResult, { ok: true }>, "settings"> & {
      settings: ReconciledRelayProfileSettings<Settings>;
    })
  | Extract<RelayProfileCommitResult, { ok: false }>;

export function commitRelayChanges<Settings extends RelayProfileSettings>(
  state: RelayProfileEditorState,
  originalSettings: Settings,
): ConcreteCommitResult<Settings> {
  const result = commit(state);
  if (!result.ok) return result;
  return {
    ...result,
    settings: { ...originalSettings, ...result.settings },
  };
}

export function normalizeRelaySettings<Settings extends RelayProfileSettings>(
  settings: Settings,
  defaultContextSelection: RelayContextSelection,
): ReconciledRelayProfileSettings<Settings> {
  const normalized = open({ settings, defaultContextSelection }).context.settings;
  return { ...settings, ...normalized };
}

export function relaySwitchIssue(
  settings: RelayProfileSettings,
  defaultContextSelection: RelayContextSelection,
  profileId: string,
): string | null {
  return open({
    settings,
    defaultContextSelection,
    focus: { type: "existing", profileId },
  }).semantic.switchIssue?.message ?? null;
}

export async function runProviderDiagnosis<Profile, Result>(
  profile: Profile,
  diagnose: (profile: Profile) => Promise<Result>,
  transition: (state: { running: boolean; result?: Result | null }) => void,
): Promise<Result> {
  transition({ running: true, result: null });
  try {
    const result = await diagnose(profile);
    transition({ running: true, result });
    return result;
  } finally {
    transition({ running: false });
  }
}

export function shouldRefreshRelayFiles({
  detailProfileId,
  isNewProfile,
  activeRelayId,
}: {
  detailProfileId: string | null;
  isNewProfile: boolean;
  activeRelayId: string;
}): boolean {
  return !isNewProfile
    && detailProfileId !== null
    && detailProfileId === activeRelayId;
}
