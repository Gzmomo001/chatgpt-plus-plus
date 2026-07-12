export type UserScriptsIntent =
  | { type: "refreshMarket" }
  | { type: "refreshLocal" }
  | { type: "install"; id: string }
  | { type: "toggle"; key: string; enabled: boolean }
  | { type: "delete"; key: string };

export type UserScriptsResourceKey =
  | "refresh:market"
  | "refresh:local"
  | `market:${string}`
  | `script:${string}`;

export function userScriptsIntentResource(
  intent: UserScriptsIntent,
): UserScriptsResourceKey {
  switch (intent.type) {
    case "refreshMarket":
      return "refresh:market";
    case "refreshLocal":
      return "refresh:local";
    case "install":
      return `market:${intent.id}`;
    case "toggle":
    case "delete":
      return `script:${intent.key}`;
  }
}

export function isUserScriptsIntentPending(
  pending: readonly UserScriptsResourceKey[],
  intent: UserScriptsIntent,
): boolean {
  return pending.includes(userScriptsIntentResource(intent));
}

export function createUserScriptsActionRunner(ports: {
  execute: (intent: UserScriptsIntent) => Promise<void>;
  pendingChanged: (pending: readonly UserScriptsResourceKey[]) => void;
}) {
  const pending = new Set<UserScriptsResourceKey>();

  return {
    async execute(intent: UserScriptsIntent): Promise<boolean> {
      const resource = userScriptsIntentResource(intent);
      if (pending.size > 0) return false;
      pending.add(resource);
      ports.pendingChanged([...pending]);
      try {
        await ports.execute(intent);
        return true;
      } finally {
        pending.delete(resource);
        ports.pendingChanged([...pending]);
      }
    },
  };
}
