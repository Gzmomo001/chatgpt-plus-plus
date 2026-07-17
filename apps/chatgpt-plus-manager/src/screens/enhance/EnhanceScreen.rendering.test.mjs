import assert from "node:assert/strict";
import test from "node:test";

import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("plugin marketplace operations do not render progress bars", async () => {
  const server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { EnhanceScreen } = await server.ssrLoadModule(
      "/src/screens/enhance/EnhanceScreen.tsx",
    );
    const idleAction = async () => {};
    const successfulAction = async () => true;
    const html = renderToStaticMarkup(createElement(EnhanceScreen, {
      view: {
        settings: {
          computerUseGuardEnabled: false,
          codexAppFastStartup: false,
        },
        pluginMarketplacePending: false,
        remotePluginMarketplace: {
          marketplaceRoot: "/tmp/plugins-remote",
          configRegistered: true,
          pluginCount: 10,
          skillCount: 110,
        },
        remotePluginMarketplacePending: true,
        pluginInventory: null,
        pluginInventoryPending: null,
      },
      actions: {
        updateFlag: () => {},
        repairPluginMarketplace: idleAction,
        refreshRemotePluginMarketplaceStatus: idleAction,
        repairRemotePluginMarketplace: idleAction,
        refreshPluginInventory: idleAction,
        mutatePlugin: idleAction,
        registerPluginMarketplace: successfulAction,
        upgradePluginMarketplace: idleAction,
        upgradeRemotePluginMarketplace: idleAction,
      },
    }));

    assert.doesNotMatch(html, /role="progressbar"/);
    assert.doesNotMatch(html, /上次修复结果/);
    assert.match(html, /官方插件市场/);
    assert.match(html, /内置备用插件市场/);
    assert.match(html, /插件市场 URL/);
    assert.match(html, /注册远程市场/);
    assert.doesNotMatch(html, /个人市场名称/);
    assert.doesNotMatch(html, /选择目录并注册/);
  } finally {
    await server.close();
  }
});
