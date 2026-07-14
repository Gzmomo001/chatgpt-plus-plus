import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { t } from "@/i18n";
import { Field } from "@/shared/ui/field";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";
import { StatusBadge as Badge } from "@/shared/ui/status-badge";

type MaintenanceStatusView = {
  status?: string;
  path?: string | null;
};

export type MaintenanceLaunchForm = {
  appPath: string;
};

export type MaintenanceView = {
  codexApp: MaintenanceStatusView;
  savedCodexAppPath: string;
  launchForm: MaintenanceLaunchForm;
  removeOwnedData: boolean;
};

export type MaintenanceActions = {
  updateLaunchForm: (next: MaintenanceLaunchForm) => void;
  setRemoveOwnedData: (value: boolean) => void;
  checkHealth: () => Promise<void>;
  repairShortcuts: () => Promise<void>;
  installEntrypoints: () => Promise<void>;
  uninstallEntrypoints: () => Promise<void>;
  chooseCodexAppPath: (mode: "folder" | "file") => Promise<void>;
  clearCodexAppPath: () => Promise<void>;
  launch: () => Promise<void>;
  saveManualCodexAppPath: () => Promise<void>;
};

export function MaintenanceScreen({ view, actions }: { view: MaintenanceView; actions: MaintenanceActions }) {
  const { codexApp, launchForm, savedCodexAppPath } = view;
  const isWindows =
    typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("windows");

  return (
    <>
      <Panel>
        <CardHead title={t("检查与修复")} detail={t("检查 Codex 应用状态")} />
        <CardContent>
          <div className="status-table">
            <StatusRow title={t("Codex 应用")} {...codexApp} />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.checkHealth()}>{t("检查")}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("Codex 应用路径")} detail={t("设置一次默认路径，也可以临时覆盖后启动")} />
        <CardContent>
          <div className="status-table">
            <StatusRow title={t("保存路径")} status={savedCodexAppPath ? "ok" : "not_checked"} path={savedCodexAppPath || null} />
            <StatusRow title={t("当前识别")} {...codexApp} />
          </div>
          <Field label={t("保存的应用路径")}>
            <Input
              value={savedCodexAppPath}
              placeholder={t("选择 Codex.exe、Codex.app、app 目录或解包目录")}
              readOnly
            />
          </Field>
          <Toolbar>
            <Button onClick={() => void actions.chooseCodexAppPath("folder")}>{t("选择应用目录")}</Button>
            <Button variant="secondary" onClick={() => void actions.chooseCodexAppPath("file")}>{t("选择 Codex.exe")}</Button>
            <Button variant="secondary" onClick={() => void actions.clearCodexAppPath()}>{t("清除保存路径")}</Button>
          </Toolbar>
          <section className="feature-group">
            <div className="feature-group-head">
              <strong>{t("手动启动")}</strong>
              <small>{t("应用路径留空时使用已保存路径；没有保存路径时使用自动探测")}</small>
            </div>
            <Field label={t("应用路径覆盖")}>
              <Input
                value={launchForm.appPath}
                onChange={(event) => actions.updateLaunchForm({ ...launchForm, appPath: event.currentTarget.value })}
                placeholder={savedCodexAppPath || t("例如 C:\\Program Files\\WindowsApps\\OpenAI.Codex...\\app")}
              />
            </Field>
            <Toolbar>
              <Button onClick={() => void actions.launch()}>{t("启动 ChatGPT++")}</Button>
              <Button variant="secondary" onClick={() => void actions.saveManualCodexAppPath()}>
                {t("保存为默认路径")}
              </Button>
            </Toolbar>
          </section>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead
          title={t("入口管理")}
          detail={
            isWindows
              ? t("创建 ChatGPT++ 桌面快捷方式")
              : t("安装、卸载或修复 ChatGPT++ 系统入口")
          }
        />
        <CardContent>
          <section className="feature-group">
            <div className="feature-group-head">
              <strong>{t("入口管理")}</strong>
              <small>{t("快捷方式写入系统实际桌面位置，不使用写死桌面路径")}</small>
            </div>
            <Toolbar>
              {isWindows ? (
                <Button onClick={() => void actions.installEntrypoints()}>{t("创建快捷方式")}</Button>
              ) : (
                <>
                  <Button onClick={() => void actions.installEntrypoints()}>{t("安装入口")}</Button>
                  <Button variant="secondary" onClick={() => void actions.uninstallEntrypoints()}>{t("卸载入口")}</Button>
                  <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>{t("修复入口")}</Button>
                </>
              )}
            </Toolbar>
            {!isWindows ? (
              <label className="check-row">
                <input
                  checked={view.removeOwnedData}
                  onChange={(event) => actions.setRemoveOwnedData(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>{t("卸载时移除 ChatGPT++ 托管数据")}</span>
              </label>
            ) : null}
          </section>
        </CardContent>
      </Panel>
    </>
  );
}

function StatusRow({ title, status = "unknown", path }: { title: string; status?: string; path?: string | null }) {
  return (
    <div className="status-row">
      <span>{title}</span>
      <Badge status={status} />
      <code>{path || t("未记录路径")}</code>
    </div>
  );
}
