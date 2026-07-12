import { Info, ShieldCheck, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { t, tf } from "@/i18n";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";
import { StatusBadge as Badge } from "@/shared/ui/status-badge";
import { TaskProgressBox, type TaskProgress } from "@/shared/ui/task-progress";

export type EnhanceFlag =
  | "enhancementsEnabled"
  | "computerUseGuardEnabled"
  | "codexAppPluginMarketplaceUnlock"
  | "codexAppPluginAutoExpand"
  | "codexAppModelWhitelistUnlock"
  | "codexAppServiceTierControls"
  | "codexAppSessionDelete"
  | "codexAppMarkdownExport"
  | "codexAppPasteFix"
  | "codexAppProjectMove"
  | "codexAppThreadIdBadge"
  | "codexAppConversationView"
  | "codexAppThreadScrollRestore"
  | "codexAppStepwiseEnabled"
  | "codexAppStepwiseDirectSend"
  | "codexAppForceChineseLocale"
  | "codexAppFastStartup"
  | "codexAppNativeMenuPlacement"
  | "codexAppNativeMenuLocalization"
  | "codexAppUpstreamWorktreeCreate";

export type EnhanceSettingsView = {
  enhancementsEnabled: boolean;
  computerUseGuardEnabled: boolean;
  codexAppPluginMarketplaceUnlock: boolean;
  codexAppPluginAutoExpand: boolean;
  codexAppModelWhitelistUnlock: boolean;
  codexAppServiceTierControls: boolean;
  codexAppSessionDelete: boolean;
  codexAppMarkdownExport: boolean;
  codexAppPasteFix: boolean;
  codexAppProjectMove: boolean;
  codexAppThreadIdBadge: boolean;
  codexAppConversationView: boolean;
  codexAppThreadScrollRestore: boolean;
  codexAppStepwiseEnabled: boolean;
  codexAppStepwiseDirectSend: boolean;
  codexAppForceChineseLocale: boolean;
  codexAppFastStartup: boolean;
  codexAppNativeMenuPlacement: boolean;
  codexAppNativeMenuLocalization: boolean;
  codexAppUpstreamWorktreeCreate: boolean;
  launchMode: "patch" | "relay";
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
};

export type EnhanceActions = {
  updateFlag: (key: EnhanceFlag, value: boolean) => void;
  setLaunchMode: (launchMode: "patch" | "relay") => Promise<void>;
  repairPluginMarketplace: () => Promise<void>;
  refreshRemotePluginMarketplace: () => Promise<void>;
  repairRemotePluginMarketplace: () => Promise<void>;
  saveSettings: () => Promise<void>;
};

export function EnhanceScreen({ view, actions }: { view: EnhanceView; actions: EnhanceActions }) {
  const {
    settings,
    pluginMarketplaceProgress,
    remotePluginMarketplace,
    remotePluginMarketplaceProgress,
  } = view;
  const masterEnabled = settings.enhancementsEnabled;
  const patchMode = settings.launchMode === "patch";
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
    <Panel>
      <CardHead title={t("Codex增强")} detail={t("会话删除、导出、项目移动和用户脚本等界面能力")} />
      <CardContent>
        <label className="switch-row">
          <input
            checked={settings.enhancementsEnabled}
            onChange={(event) => actions.updateFlag("enhancementsEnabled", event.currentTarget.checked)}
            type="checkbox"
          />
          <span>
            <strong>{t("启用 Codex增强")}</strong>
            <small>{t("关闭后会停用删除、导出、项目移动、插件相关和菜单位置增强。")}</small>
          </span>
        </label>
        <label className="switch-row">
          <input
            checked={settings.computerUseGuardEnabled}
            onChange={(event) => actions.updateFlag("computerUseGuardEnabled", event.currentTarget.checked)}
            type="checkbox"
          />
          <span>
            <strong>{t("启用 Windows Computer Use Guard")}</strong>
            <small>{t("默认关闭；开启后启动 Codex 时会自动保留官方 Computer Use 插件所需的 config.toml、bundled 插件和 notify 配置。")}</small>
          </span>
        </label>
        <ModeSelector launchMode={settings.launchMode} onChange={actions.setLaunchMode} />
        {settings.launchMode === "relay" ? (
          <div className="hint-line">
            <ShieldCheck className="h-4 w-4" />
            <span>{t("当前为兼容增强模式，插件市场解锁不会启用；其他页面功能仍可用。")}</span>
          </div>
        ) : null}
        <div className="enhance-feature-groups">
          <FeatureGroup title={t("插件与模型")} detail={t("管理插件市场、模型列表和服务档位相关增强。")}>
            <FeatureToggle title={t("插件市场解锁")} detail={t("API Key 模式下扩展插件市场请求，尽量显示完整插件列表；官方/混合模式通常不需要。")} checked={settings.codexAppPluginMarketplaceUnlock} disabled={!masterEnabled || !patchMode} onChange={(value) => actions.updateFlag("codexAppPluginMarketplaceUnlock", value)} />
            <FeatureToggle title={t("插件列表全量展示")} detail={t("进入插件页后自动连续展开“更多”，尽量一次显示完整插件列表。")} checked={settings.codexAppPluginAutoExpand} disabled={!masterEnabled || !patchMode} onChange={(value) => actions.updateFlag("codexAppPluginAutoExpand", value)} />
            <FeatureToggle title={t("模型白名单解锁")} detail={t("从环境变量和 config.toml 的 /v1/models 拉取模型并补进模型列表。")} checked={settings.codexAppModelWhitelistUnlock} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppModelWhitelistUnlock", value)} />
            <FeatureToggle title={t("Fast 按钮")} detail={t("显示服务模式切换按钮；Fast 仅支持 gpt-5.4 / gpt-5.5，其他模型按 Standard 发送。")} checked={settings.codexAppServiceTierControls} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppServiceTierControls", value)} />
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
              <Button disabled={remotePluginMarketplaceProgress.active} onClick={() => void actions.refreshRemotePluginMarketplace()} variant="outline">
                {t("刷新")}
              </Button>
              <span className="feature-action-status">{remoteMarketplaceStatus}</span>
            </div>
          </FeatureGroup>
          <FeatureGroup title={t("对话与输入")} detail={t("调整会话管理、输入行为和对话阅读体验。")}>
            <FeatureToggle title={t("会话删除")} detail={t("在会话列表悬停显示删除按钮，并支持撤销。")} checked={settings.codexAppSessionDelete} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppSessionDelete", value)} />
            <FeatureToggle title={t("Markdown 导出")} detail={t("在会话列表显示导出按钮，导出带时间戳的 Markdown。")} checked={settings.codexAppMarkdownExport} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppMarkdownExport", value)} />
            <FeatureToggle title={t("粘贴修复")} detail={t("从 Word 等富文本粘贴到 Codex composer 时只保留纯文本，避免被识别为图片/文件附件。需重启 Codex 才生效。")} checked={settings.codexAppPasteFix} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppPasteFix", value)} />
            <FeatureToggle title={t("会话项目移动")} detail={t("把会话移动到普通对话或其他本地项目。")} checked={settings.codexAppProjectMove} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppProjectMove", value)} />
            <FeatureToggle title={t("会话 ID 标识")} detail={t("在侧边栏会话标题前显示短 ID 和 UUIDv7 创建时间，方便定位历史会话。")} checked={settings.codexAppThreadIdBadge} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppThreadIdBadge", value)} />
            <FeatureToggle title={t("对话居中宽度")} detail={t("把主对话和输入框限制到固定最大宽度，适合大屏阅读。")} checked={settings.codexAppConversationView} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppConversationView", value)} />
            <FeatureToggle title={t("切换对话保留位置")} detail={t("切换 thread 时恢复上一次浏览位置。")} checked={settings.codexAppThreadScrollRestore} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppThreadScrollRestore", value)} />
          </FeatureGroup>
          <FeatureGroup title="Stepwise" detail={t("基于当前对话生成下一步建议，使用独立 API 配置。")}>
            <FeatureToggle title="Stepwise" detail={t("在 Codex 页面显示可拖动的后续建议浮层；建议由单独配置的 Stepwise API 生成。")} checked={settings.codexAppStepwiseEnabled} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppStepwiseEnabled", value)} />
            <FeatureToggle title={t("Stepwise 直接发送")} detail={t("点击建议后自动发送；关闭时只填入输入框。")} checked={settings.codexAppStepwiseDirectSend} disabled={!masterEnabled || !settings.codexAppStepwiseEnabled} onChange={(value) => actions.updateFlag("codexAppStepwiseDirectSend", value)} />
          </FeatureGroup>
          <FeatureGroup title={t("界面与启动")} detail={t("控制语言、启动速度和 Codex 原生界面调整。")}>
            <FeatureToggle title={t("强制中文界面")} detail={t("强制启用 Codex App 内置 zh-CN 语言包，避免 Statsig/VPN 不通时回退英文。需重启 Codex 才能完整生效。")} checked={settings.codexAppForceChineseLocale} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppForceChineseLocale", value)} />
            <FeatureToggle title={t("快速启动")} detail={t("默认关闭；无 VPN 时可开启，让 Statsig 初始化快速失败，减少启动时长。需重启 Codex 才生效。")} checked={settings.codexAppFastStartup} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppFastStartup", value)} />
            <FeatureToggle title={t("原生菜单栏位置")} detail={t("把 ChatGPT++ 菜单插入 Codex 顶部原生菜单栏。")} checked={settings.codexAppNativeMenuPlacement} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppNativeMenuPlacement", value)} />
            <FeatureToggle title={t("原生菜单汉化")} detail={t("启动时通过本地主进程调试端口汉化 Codex 原生菜单；不修改安装包。需重启 Codex 才生效。")} checked={settings.codexAppNativeMenuLocalization} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppNativeMenuLocalization", value)} />
          </FeatureGroup>
          <FeatureGroup title={t("远程项目")} detail={t("管理 upstream worktree 辅助能力。")}>
            <FeatureToggle title="Upstream worktree" detail={t("从最新 upstream 分支创建 Git worktree。")} checked={settings.codexAppUpstreamWorktreeCreate} disabled={!masterEnabled} onChange={(value) => actions.updateFlag("codexAppUpstreamWorktreeCreate", value)} />
          </FeatureGroup>
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
        <div className="hint-line">
          <Info className="h-4 w-4" />
          <span>{t("如果使用官方模式或官方混入 API 模式，通常不需要开启插件市场解锁。")}</span>
        </div>
        <Toolbar>
          <Button onClick={() => void actions.saveSettings()}>{t("保存增强设置")}</Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function ModeSelector({ launchMode, onChange }: { launchMode: "patch" | "relay"; onChange: (mode: "patch" | "relay") => Promise<void> }) {
  return (
    <div className="mode-grid">
      <button className={`mode-option ${launchMode === "relay" ? "active" : ""}`} onClick={() => void onChange("relay")} type="button">
        <strong>{t("兼容增强")}</strong>
        <span>{t("适合官方登录或官方混入 API Key；保留会话删除、导出、项目移动和用户脚本，关闭插件市场相关增强。")}</span>
      </button>
      <button className={`mode-option ${launchMode === "patch" ? "active" : ""}`} onClick={() => void onChange("patch")} type="button">
        <strong>{t("完整增强")}</strong>
        <span>{t("适合纯 API；启用插件市场、会话删除导出、项目移动等全部页面能力。")}</span>
      </button>
    </div>
  );
}

function FeatureGroup({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return <section className="feature-group"><div className="feature-group-head"><strong>{title}</strong><small>{detail}</small></div><div className="feature-switch-grid">{children}</div></section>;
}

function FeatureToggle({ title, detail, checked, disabled = false, onChange }: { title: string; detail: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className={`feature-toggle ${disabled ? "disabled" : ""}`}><input checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" /><span><strong>{title}</strong><small>{detail}</small></span><Badge status={!disabled && checked ? "ok" : "disabled"} /></label>;
}
