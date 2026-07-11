import assert from "node:assert/strict";
import test from "node:test";

import type { AdItem } from "../../shared/contracts/recommendations.ts";
import { projectRecommendations } from "./presentation.ts";

const NOW = Date.parse("2026-07-12T00:00:00.000Z");

function ad(title: string, type: string, expires_at?: string): AdItem {
  return {
    title,
    type,
    description: `${title} description`,
    url: `https://example.com/${title}`,
    ...(expires_at === undefined ? {} : { expires_at }),
  };
}

test("filters only ads with a valid expiry strictly before the injected time", () => {
  const missing = ad("missing", "sponsor");
  const invalid = ad("invalid", "normal", "not-a-date");
  const expired = ad("expired", "normal", "2026-07-11T23:59:59.999Z");
  const boundary = ad("boundary", "sponsor", "2026-07-12T00:00:00.000Z");
  const future = ad("future", "normal", "2026-07-12T00:00:00.001Z");

  assert.deepEqual(
    projectRecommendations([missing, invalid, expired, boundary, future], NOW).items,
    [missing, invalid, boundary, future],
  );
});

test("partitions sponsor and normal recommendations without reordering either group", () => {
  const sponsorOne = ad("sponsor-one", "sponsor");
  const normalOne = ad("normal-one", "normal");
  const sponsorTwo = ad("sponsor-two", "sponsor");
  const normalTwo = ad("normal-two", "normal");

  const result = projectRecommendations(
    [sponsorOne, normalOne, sponsorTwo, normalTwo],
    NOW,
  );

  assert.deepEqual(result.sponsors, [sponsorOne, sponsorTwo]);
  assert.deepEqual(result.normal, [normalOne, normalTwo]);
});

test("keeps non-expired unknown ad types in the loaded count but outside both grids", () => {
  const unknown = ad("unknown", "community");

  const result = projectRecommendations([unknown], NOW);

  assert.deepEqual(result.items, [unknown]);
  assert.deepEqual(result.sponsors, []);
  assert.deepEqual(result.normal, []);
});
