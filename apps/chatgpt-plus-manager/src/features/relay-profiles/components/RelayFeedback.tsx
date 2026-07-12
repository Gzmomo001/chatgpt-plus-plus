import { CheckCircle2, Info, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";

import { Badge as UiBadge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { t } from "@/i18n";
import type {
  EnvConflictsResult,
  ProviderDoctorResult,
  RelayProfileActions,
  RelaySettings,
} from "../contracts";

export function EnvConflictNotice<Settings extends RelaySettings>({
  envConflicts,
  actions,
}: {
  envConflicts: EnvConflictsResult | null;
  actions: RelayProfileActions<Settings>;
}) {
  const conflicts = envConflicts?.conflicts ?? [];
  if (!conflicts.length) return null;
  const names = Array.from(new Set(conflicts.map((conflict) => conflict.name))).sort();
  return (
    <div className="env-conflict-notice">
      <div className="env-conflict-icon">
        <ShieldAlert className="h-4 w-4" />
      </div>
      <div className="env-conflict-body">
        <strong>{t("检测到 OPENAI 环境变量")}</strong>
        <p>{t("这些变量可能覆盖当前供应商写入的 config.toml / auth.json；CODEX_HOME 不会被清理。")}</p>
        <div className="env-conflict-tags">
          {conflicts.map((conflict) => (
            <span key={`${conflict.source}-${conflict.name}`}>
              {conflict.name}
              <small>{envConflictSourceLabel(conflict.source)}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="env-conflict-actions">
        <Button onClick={() => void actions.removeEnvConflicts(names)} size="sm">
          <Trash2 className="h-4 w-4" />
          {t("删除")}
        </Button>
        <Button
          onClick={() => void actions.refreshEnvConflicts(false)}
          size="sm"
          variant="secondary"
        >
          <RefreshCw className="h-4 w-4" />
          {t("检测")}
        </Button>
      </div>
    </div>
  );
}

function envConflictSourceLabel(source: string): string {
  if (source === "process") return t("当前进程");
  if (source === "user") return t("用户环境");
  return source || t("环境变量");
}

export function ProviderDoctorModal({
  result,
  running,
  onClose,
}: {
  result: ProviderDoctorResult | null;
  running: boolean;
  onClose: () => void;
}) {
  const steps = providerDoctorSteps(result, running);
  const progress = Math.round(
    (steps.filter((step) => ["ok", "warning", "failed"].includes(step.state)).length
      / steps.length) * 100,
  );
  const resultFailed = result !== null && !isSuccessStatus(result.status);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card provider-doctor-modal">
        <div className="modal-head">
          <div>
            <h2>Provider Doctor</h2>
            <p>{running ? t("正在诊断供应商，请稍候。") : result?.summary ?? t("诊断已完成。")}</p>
          </div>
          <UiBadge variant={resultFailed ? "outline" : "secondary"}>
            {running ? t("诊断中") : resultFailed ? t("异常") : t("完成")}
          </UiBadge>
        </div>
        <div
          className="provider-doctor-progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          role="progressbar"
        >
          <div style={{ width: `${progress}%` }} />
        </div>
        <div className="provider-doctor-step-list">
          {steps.map((step) => (
            <div className={`provider-doctor-step ${step.state}`} key={step.id}>
              <span className="provider-doctor-step-icon">
                <DoctorStepIcon state={step.state} />
              </span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
            </div>
          ))}
        </div>
        {result?.recommendation ? (
          <p className="provider-doctor-recommendation">{result.recommendation}</p>
        ) : null}
        <div className="modal-actions">
          <Button disabled={running} onClick={onClose} variant="secondary">
            {running ? t("诊断中") : t("关闭")}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ProviderDoctorStepState = "pending" | "running" | "ok" | "warning" | "failed";

function DoctorStepIcon({ state }: { state: ProviderDoctorStepState }) {
  if (state === "running") return <RefreshCw className="h-4 w-4" />;
  if (state === "ok") return <CheckCircle2 className="h-4 w-4" />;
  if (state === "warning") return <ShieldAlert className="h-4 w-4" />;
  if (state === "failed") return <Info className="h-4 w-4" />;
  return <span />;
}

function isSuccessStatus(status?: string): boolean {
  return status === "ok" || status === "accepted";
}

function providerDoctorSteps(
  result: ProviderDoctorResult | null,
  running: boolean,
): Array<{ id: string; title: string; detail: string; state: ProviderDoctorStepState }> {
  const base = [
    { id: "config", title: t("配置完整性"), pending: t("等待检查 Base URL / API Key。") },
    { id: "models", title: t("模型列表"), pending: t("等待检查 /v1/models。") },
    { id: "request", title: t("真实请求"), pending: t("等待发送一次测试请求。") },
    { id: "recommendation", title: t("处理建议"), pending: t("等待生成建议。") },
  ];
  if (!result) {
    return base.map((step, index) => ({
      id: step.id,
      title: step.title,
      detail: index === 0 && running ? t("正在检查配置完整性…") : step.pending,
      state: index === 0 && running ? "running" : "pending",
    }));
  }
  const checks = new Map(result.checks.map((check) => [check.id, check]));
  return base.map((step) => {
    if (step.id === "recommendation") {
      return {
        id: step.id,
        title: step.title,
        detail: result.recommendation || step.pending,
        state: result.status === "failed" ? "warning" : "ok",
      };
    }
    const check = checks.get(step.id);
    if (!check) {
      return {
        id: step.id,
        title: step.title,
        detail: step.id === "models" || step.id === "request"
          ? t("该步骤未执行。")
          : step.pending,
        state: "pending",
      };
    }
    return {
      id: step.id,
      title: check.title || step.title,
      detail: check.detail,
      state: check.status === "ok"
        ? "ok"
        : check.status === "warning"
          ? "warning"
          : "failed",
    };
  });
}
