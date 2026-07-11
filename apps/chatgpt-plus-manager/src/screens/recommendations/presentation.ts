import type { AdItem } from "../../shared/contracts/recommendations.ts";

export type RecommendationsProjection = {
  items: AdItem[];
  sponsors: AdItem[];
  normal: AdItem[];
};

export function projectRecommendations(
  ads: readonly AdItem[],
  now: number,
): RecommendationsProjection {
  const items = ads.filter((ad) => {
    if (!ad.expires_at) return true;
    const expiresAt = Date.parse(ad.expires_at);
    return !Number.isFinite(expiresAt) || expiresAt >= now;
  });

  return {
    items,
    sponsors: items.filter((ad) => ad.type === "sponsor"),
    normal: items.filter((ad) => ad.type === "normal"),
  };
}
