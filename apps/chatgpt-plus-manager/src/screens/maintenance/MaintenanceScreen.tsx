import { Button } from "@/shared/ui/button";
import { t } from "@/i18n";
import { SettingsCard, Toolbar } from "@/shared/ui/layout";

export type MaintenanceActions = {
  installEntrypoints: () => Promise<void>;
};

export function MaintenanceScreen({ actions }: { actions: MaintenanceActions }) {
  const isWindows =
    typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("windows");

  if (!isWindows) return null;

  return (
    <SettingsCard
      title={t("创建 ChatGPT++ 桌面快捷方式")}
      detail={t("快捷方式写入系统实际桌面位置，不使用写死桌面路径")}
    >
      <Toolbar>
        <Button onClick={() => void actions.installEntrypoints()}>{t("创建快捷方式")}</Button>
      </Toolbar>
    </SettingsCard>
  );
}
