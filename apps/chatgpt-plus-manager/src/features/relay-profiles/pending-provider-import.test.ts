import assert from "node:assert/strict";
import test from "node:test";

import { projectPendingProviderImport } from "./pending-provider-import.ts";

test("projects provider import wire values into a safe neutral dialog view", () => {
  assert.deepEqual(
    projectPendingProviderImport({
      name: "RunAPI",
      baseUrl: "https://api.example/v1",
      wireApi: "chat_completions",
      relayMode: "mixed-api",
      apiKey: "sk-1234567890-secret",
    }),
    {
      name: "RunAPI",
      baseUrl: "https://api.example/v1",
      protocol: "Chat Completions",
      mode: "混入 API",
      maskedApiKey: "sk-123…cret",
    },
  );

  assert.deepEqual(
    projectPendingProviderImport({
      name: "",
      baseUrl: "",
      wireApi: "responses",
      relayMode: "aggregate",
      apiKey: "",
    }),
    {
      name: "未命名供应商",
      baseUrl: "未填写",
      protocol: "Responses",
      mode: "聚合供应商",
      maskedApiKey: "未填写",
    },
  );
});
