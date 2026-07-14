export const ROUTE_IDS = [
  "relay",
  "sessions",
  "enhance",
  "settings",
] as const;

export type Route = (typeof ROUTE_IDS)[number];

export function loadInitialRoute(location?: { search: string; hash: string }): Route {
  if (!location) return "relay";
  const params = new URLSearchParams(location.search);
  return params.get("showUpdate") === "1" || location.hash === "#about" ? "settings" : "relay";
}
