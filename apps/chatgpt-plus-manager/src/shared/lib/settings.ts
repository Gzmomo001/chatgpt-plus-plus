import type { ImageOverlayFitMode } from "@/shared/contracts/settings";

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeImageOverlayFitMode(value: string | undefined): ImageOverlayFitMode {
  switch (value) {
    case "fill":
    case "fit":
    case "stretch":
    case "tile":
    case "center":
      return value;
    default:
      return "fit";
  }
}

export function numberOrDefault(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
