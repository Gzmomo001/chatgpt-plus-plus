export function codexExtraArgsToInput(args: string[] | undefined): string {
  return (args ?? []).join("\n");
}

export function inputToCodexExtraArgs(value: string): string[] {
  return value === "" ? [] : value.split(/\r?\n/);
}

export function providerTestModelOptions(models: string[], currentModel: string): string[] {
  const options = new Set(models.map((model) => model.trim()).filter(Boolean));
  const current = currentModel.trim();
  if (current) options.add(current);
  return [...options].sort((left, right) => {
    const normalized = left.toLowerCase().localeCompare(right.toLowerCase());
    return normalized || left.localeCompare(right);
  });
}
