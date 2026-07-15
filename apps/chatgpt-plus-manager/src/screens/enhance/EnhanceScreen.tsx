import { Download, Info, RefreshCw, Trash2, Wrench } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { t, tf } from "@/i18n";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";
import { StatusBadge as Badge } from "@/shared/ui/status-badge";
import { TaskProgressBox, type TaskProgress } from "@/shared/ui/task-progress";
import { Input } from "@/shared/ui/input";
import type { PluginMarketplaceInventoryResult } from "@/shared/contracts/plugins";
import { projectPluginInventoryState } from "./presentation";

export type EnhanceFlag =
  | "computerUseGuardEnabled"
  | "codexAppFastStartup";

export type EnhanceSettingsView = {
  computerUseGuardEnabled: boolean;
  codexAppFastStartup: boolean;
};

export type RemotePluginMarketplaceView = {
  marketplaceRoot: string | null;
  configRegistered: boolean;
  pluginCount: number;
  skillCount: number;
};

export type EnhanceView = {
  settings: EnhanceSettingsView;
  pluginMarketplaceProgress: TaskProgress;
  remotePluginMarketplace: RemotePluginMarketplaceView | null;
  remotePluginMarketplaceProgress: TaskProgress;
  pluginInventory: PluginMarketplaceInventoryResult | null;
  pluginInventoryPending: string | null;
};

export type EnhanceActions = {
  updateFlag: (key: EnhanceFlag, value: boolean) => void;
  repairPluginMarketplace: () => Promise<void>;
  refreshRemotePluginMarketplaceStatus: () => Promise<void>;
  repairRemotePluginMarketplace: () => Promise<void>;
  refreshPluginInventory: () => Promise<void>;
  mutatePlugin: (pluginId: string, action: "install" | "uninstall" | "enable" | "disable") => Promise<void>;
  registerPluginMarketplace: (name: string) => Promise<void>;
  upgradePluginMarketplace: () => Promise<void>;
  upgradeRemotePluginMarketplace: () => Promise<void>;
};

export function EnhanceScreen({ view, actions }: { view: EnhanceView; actions: EnhanceActions }) {
  const {
    settings,
    pluginMarketplaceProgress,
    remotePluginMarketplace,
    remotePluginMarketplaceProgress,
    pluginInventory,
    pluginInventoryPending,
  } = view;
  const isWindows =
    typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("windows");
  const [marketplaceName, setMarketplaceName] = useState("");
  const pluginInventoryState = projectPluginInventoryState(pluginInventory, pluginInventoryPending);
  const remoteMarketplaceStatus = remotePluginMarketplace?.marketplaceRoot
    ? remotePluginMarketplace.configRegistered
      ? t("已注册")
      : t("已缓存未注册")
    : t("未发现缓存");
  const remoteMarketplaceSummary = remotePluginMarketplace?.marketplaceRoot
    ? tf("已缓存 {0} 个插件 / {1} 个技能。", [
        String(remotePluginMarketplace.pluginCount),
        String(remotePluginMarketplace.skillCount),
      ])
    : t("未发现本地缓存；点击按钮会从 ChatGPT++ 内置快照释放并注册，无需官方账号预缓存。");

  return (
    <>
      <Panel>
        <CardHead title={t("启动增强")} detail={t("只影响 ChatGPT++ 启动 Codex 时的本地行为")} />
        <CardContent>
          <div className="feature-switch-grid">
            {isWindows ? (
              <FeatureToggle
                title={t("Windows Computer Use Guard")}
                detail={t("默认关闭；开启后启动 Codex 时会自动保留官方 Computer Use 插件所需的 config.toml、bundled 插件和 notify 配置。")}
                checked={settings.computerUseGuardEnabled}
                onChange={(value) => actions.updateFlag("computerUseGuardEnabled", value)}
              />
            ) : null}
            <FeatureToggle
              title={t("快速启动")}
              detail={t("默认关闭；无 VPN 时可开启，让 Statsig 初始化快速失败，减少启动时长。需重启 Codex 才生效。")}
              checked={settings.codexAppFastStartup}
              onChange={(value) => actions.updateFlag("codexAppFastStartup", value)}
            />
          </div>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("插件市场")} detail={t("管理市场来源、插件安装状态和本地缓存")} />
        <CardContent>
          <div className="feature-group">
            <div className="feature-action-row">
              <div>
                <strong>{t("官方远端插件缓存")}</strong>
                <small>{t("使用 ChatGPT++ 内置快照补齐远端插件，API 模式也可显示和安装 Product Design 插件。")}</small>
                <small>{remoteMarketplaceSummary}</small>
              </div>
              <Badge status={remotePluginMarketplace?.configRegistered ? "ok" : "not_checked"} />
              <Button disabled={remotePluginMarketplaceProgress.active} onClick={() => void actions.repairRemotePluginMarketplace()} variant="secondary">
                {remotePluginMarketplaceProgress.active ? t("正在处理…") : t("释放并注册内置缓存")}
              </Button>
              <Button disabled={remotePluginMarketplaceProgress.active} onClick={() => void actions.refreshRemotePluginMarketplaceStatus()} variant="outline">
                {t("刷新")}
              </Button>
              <span className="feature-action-status">{remoteMarketplaceStatus}</span>
            </div>
          </div>
          <div className="hint-line">
            <Wrench className="h-4 w-4" />
            <span>{t("新机器没有本地插件市场时，可从 openai/plugins 初始化到当前 CODEX_HOME。")}</span>
            <Button disabled={pluginMarketplaceProgress.active} variant="secondary" onClick={() => void actions.repairPluginMarketplace()}>
              {pluginMarketplaceProgress.active ? t("正在修复…") : t("修复插件市场")}
            </Button>
          </div>
          <TaskProgressBox progress={pluginMarketplaceProgress} title={t("插件市场修复进度")} />
          <TaskProgressBox progress={remotePluginMarketplaceProgress} title={t("官方远端插件缓存进度")} />
          <div className="plugin-inventory-panel">
          <div className="relay-context-head">
            <div>
              <strong>{t("插件与技能库存")}</strong>
              <span>{t("直接读取已注册 marketplace 和 config.toml，不依赖 Codex Renderer。")}</span>
            </div>
            <Toolbar>
              <Button disabled={!!pluginInventoryPending} onClick={() => void actions.refreshPluginInventory()} size="sm" variant="outline">
                <RefreshCw className="h-4 w-4" />{t("刷新库存")}
              </Button>
              <Button disabled={!!pluginInventoryPending} onClick={() => void actions.upgradePluginMarketplace()} size="sm" variant="outline">
                {t("升级官方市场")}
              </Button>
              <Button disabled={!!pluginInventoryPending} onClick={() => void actions.upgradeRemotePluginMarketplace()} size="sm" variant="outline">
                {t("刷新内置远端快照")}
              </Button>
            </Toolbar>
          </div>
          <div className="form-row">
            <Input value={marketplaceName} onChange={(event) => setMarketplaceName(event.currentTarget.value)} placeholder={t("个人市场名称，例如 personal")} />
            <Button disabled={!!pluginInventoryPending || !marketplaceName.trim()} onClick={async () => {
              await actions.registerPluginMarketplace(marketplaceName.trim());
              setMarketplaceName("");
            }} variant="secondary">{t("选择目录并注册")}</Button>
          </div>
          {pluginInventoryState === "loading" ? <div className="empty">{t("正在更新插件市场…")}</div> : null}
          {pluginInventoryState === "idle" ? <div className="empty">{t("尚未加载插件库存。")}</div> : null}
          {pluginInventoryState === "error" ? <div className="empty error">{pluginInventory?.message}</div> : null}
          {pluginInventoryState === "empty" ? <div className="empty">{t("已注册的市场中没有可用插件。")}</div> : null}
          {pluginInventoryState === "ready" && pluginInventory ? (
            <div className="plugin-inventory-list">
              {pluginInventory.plugins.map((plugin) => (
                <div className="script-market-card" key={plugin.id}>
                  <div>
                    <strong>{plugin.displayName || plugin.name}</strong>
                    <small>{plugin.id} · {tf("{0} 个技能", [plugin.skillCount])}</small>
                    {plugin.description ? <p>{plugin.description}</p> : null}
                  </div>
                  <Badge status={plugin.enabled ? "ok" : plugin.installed ? "disabled" : "not_checked"} />
                  <div className="script-row-actions">
                    {!plugin.installed ? (
                      <Button disabled={!!pluginInventoryPending} onClick={() => void actions.mutatePlugin(plugin.id, "install")} size="sm">
                        <Download className="h-4 w-4" />{t("安装")}
                      </Button>
                    ) : (
                      <>
                        <Button disabled={!!pluginInventoryPending} onClick={() => void actions.mutatePlugin(plugin.id, plugin.enabled ? "disable" : "enable")} size="sm" variant="outline">
                          {plugin.enabled ? t("禁用") : t("启用")}
                        </Button>
                        <Button disabled={!!pluginInventoryPending} onClick={() => void actions.mutatePlugin(plugin.id, "uninstall")} size="sm" variant="outline">
                          <Trash2 className="h-4 w-4" />{t("卸载")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {pluginInventory?.marketplaces.length ? (
            <small>{tf("已注册 {0} 个市场。", [pluginInventory.marketplaces.length])}</small>
          ) : null}
          </div>
          <div className="hint-line">
            <Info className="h-4 w-4" />
            <span>{t("插件市场、模型发现和 Fast 档位均采用 Codex 官方配置或原生界面，不再通过页面补丁实现。")}</span>
          </div>
        </CardContent>
      </Panel>
    </>
  );
}

function FeatureToggle({ title, detail, checked, disabled = false, onChange }: { title: string; detail: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`feature-toggle ${disabled ? "disabled" : ""}`}>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <input
        aria-label={title}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
    </label>
  );
}
