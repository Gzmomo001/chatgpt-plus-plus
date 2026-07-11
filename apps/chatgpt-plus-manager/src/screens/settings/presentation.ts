export function codexExtraArgsToInput(args: string[] | undefined): string {
  return (args ?? []).join("\n");
}

export function inputToCodexExtraArgs(value: string): string[] {
  return value === "" ? [] : value.split(/\r?\n/);
}
