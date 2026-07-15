import type { ModelWindowRow } from "./types";

export function relayTestModelOptions(
  rows: readonly ModelWindowRow[],
  currentModel: string,
): string[] {
  const options: string[] = [];
  const seen = new Set<string>();
  const append = (model: string) => {
    const normalized = model.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    options.push(normalized);
  };
  rows.forEach((row) => append(row.model));
  append(currentModel);
  return options;
}
