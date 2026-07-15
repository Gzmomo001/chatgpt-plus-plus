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
      {isWindows ? (
        <Panel>
          <CardHead
            title={t("创建 ChatGPT++ 桌面快捷方式")}
            detail={t("快捷方式写入系统实际桌面位置，不使用写死桌面路径")}
          />
          <CardContent>
            <Toolbar>
              <Button onClick={() => void actions.installEntrypoints()}>{t("创建快捷方式")}</Button>
            </Toolbar>
          </CardContent>
        </Panel>
      ) : null}
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
