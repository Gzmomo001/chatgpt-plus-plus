import type { DiagnosticsResult } from "@/shared/contracts/diagnostics";

type CopyLatestDiagnosticReportPorts = {
  generate: () => Promise<DiagnosticsResult>;
  writeClipboard: (report: string) => Promise<void>;
};

export type CopyLatestDiagnosticReportResult =
  | { status: "ok" }
  | { status: "failed"; stage: "generate" | "copy"; error: unknown };

export async function copyLatestDiagnosticReport({
  generate,
  writeClipboard,
}: CopyLatestDiagnosticReportPorts): Promise<CopyLatestDiagnosticReportResult> {
  let result: DiagnosticsResult;
  try {
    result = await generate();
  } catch (error) {
    return { status: "failed", stage: "generate", error };
  }

  if (result.status !== "ok" && result.status !== "accepted") {
    return { status: "failed", stage: "generate", error: result.message };
  }
  if (!result.report.trim()) {
    return { status: "failed", stage: "generate", error: "诊断报告内容为空。" };
  }

  try {
    await writeClipboard(result.report);
  } catch (error) {
    return { status: "failed", stage: "copy", error };
  }
  return { status: "ok" };
}
