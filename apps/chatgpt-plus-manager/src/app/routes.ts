export const ROUTE_IDS = [
  "overview",
  "relay",
  "sessions",
  "context",
  "enhance",
  "zedRemote",
  "userScripts",
  "recommendations",
  "maintenance",
  "about",
  "settings",
] as const;

export type Route = (typeof ROUTE_IDS)[number];
