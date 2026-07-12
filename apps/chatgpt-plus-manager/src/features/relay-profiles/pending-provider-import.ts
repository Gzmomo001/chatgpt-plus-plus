import { t } from "../../i18n/index.ts";

export type PendingProviderImportView = {
  name: string;
  baseUrl: string;
  protocol: string;
  mode: string;
  maskedApiKey: string;
};

type ProviderImportProjectionInput = {
  name: string;
  baseUrl: string;
  wireApi: string;
  relayMode: string;
  apiKey: string;
};

export function projectPendingProviderImport(
  request: ProviderImportProjectionInput,
): PendingProviderImportView {
  return {
    name: request.name || t("未命名供应商"),
    baseUrl: request.baseUrl || t("未填写"),
    protocol: providerImportWireApiLabel(request.wireApi),
    mode: providerImportRelayModeLabel(request.relayMode),
    maskedApiKey: maskSecret(request.apiKey),
  };
}

function providerImportWireApiLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "chat" ||
    normalized === "chat_completions" ||
    normalized === "chat-completions"
  ) {
    return "Chat Completions";
  }
  return "Responses";
}

function providerImportRelayModeLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "official") return t("官方登录");
  if (
    normalized === "mixedapi" ||
    normalized === "mixed-api" ||
    normalized === "mixed_api"
  ) {
    return t("混入 API");
  }
  if (normalized === "aggregate") return t("聚合供应商");
  return t("纯 API");
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return t("未填写");
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}
