export const ROUTE_IDS = [
  "overview",
  "relay",
  "sessions",
  "context",
  "enhance",
  "recommendations",
  "maintenance",
  "about",
  "settings",
] as const;

export type Route = (typeof ROUTE_IDS)[number];

export function loadInitialRoute(location?: { search: string; hash: string }): Route {
  if (!location) return "overview";
  const params = new URLSearchParams(location.search);
  return params.get("showUpdate") === "1" || location.hash === "#about" ? "about" : "overview";
}
