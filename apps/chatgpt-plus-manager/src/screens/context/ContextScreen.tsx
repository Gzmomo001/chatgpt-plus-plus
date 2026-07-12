import { Edit3, Plus, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import {
  readContextCatalog,
  type ContextCatalogSettings,
  type ContextEntries,
  type ContextEntry,
  type ContextKind,
} from "@/features/context/config";
import type { ContextChange } from "@/features/context/controller";
import { t } from "@/i18n";
import { Field } from "@/shared/ui/field";
import { CardHead, Panel, Toolbar } from "@/shared/ui/layout";

export type ContextActions<Settings> = {
  applyContextChange: (settings: Settings, change: ContextChange) => Promise<Settings | null>;
};

type ContextScreenProps<Settings> = {
  form: Settings;
  liveEntries: ContextEntries | null;
  onFormChange: (value: Settings) => void;
  actions: ContextActions<Settings>;
};

const contextKindOptions: Array<{ kind: ContextKind; label: string }> = [
  { kind: "mcp", label: "MCP" },
  { kind: "skill", label: "Skills" },
  { kind: "plugin", label: t("插件") },
];

export function ContextScreen<Settings extends ContextCatalogSettings>({
  form,
  liveEntries,
  onFormChange,
  actions,
}: ContextScreenProps<Settings>) {
  return (
    <Panel fill>
      <CardHead title={t("Codex 工具与插件")} detail={t("独立管理 Codex 的 MCP、Skills、Plugins；切换任意供应商都会带上。")} />
      <CardContent>
        <RelayContextManager
          form={form}
          liveEntries={liveEntries}
          onFormChange={onFormChange}
          actions={actions}
        />
      </CardContent>
    </Panel>
  );
}

function RelayContextManager<Settings extends ContextCatalogSettings>({
  form,
  liveEntries,
  onFormChange,
  actions,
}: ContextScreenProps<Settings>) {
  const catalog = readContextCatalog(form, liveEntries);
  const [activeKind, setActiveKind] = useState<ContextKind>("mcp");
  const [editor, setEditor] = useState<{ kind: ContextKind; entry?: ContextEntry } | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const visibleEntries = catalog.entriesFor(activeKind);
  const label = contextKindLabel(activeKind);

  const applyContextChange = async (change: ContextChange, onSuccess?: () => void) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const next = await actions.applyContextChange(form, change);
      if (!next) return;
      onFormChange(next);
      onSuccess?.();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <div aria-busy={pending} className="relay-context-panel">
      <div className="relay-context-head">
        <div>
          <strong>{t("Codex 工具与插件")}</strong>
          <span>{t("MCP、Skills、Plugins 作为全局配置独立管理，切换任意供应商都会合并。")}</span>
        </div>
        <div className="relay-context-head-actions">
          {pending ? <span>{t("正在保存…")}</span> : null}
          <Button disabled={pending} onClick={() => setEditor({ kind: activeKind })} size="sm" variant="secondary">
            <Plus className="h-4 w-4" />
            {t("新增")}{label}
          </Button>
        </div>
      </div>
      <div className="segmented">
        {contextKindOptions.map((option) => (
          <button
            className={activeKind === option.kind ? "active" : ""}
            key={option.kind}
            onClick={() => setActiveKind(option.kind)}
            type="button"
          >
            <span>{option.label}</span>
            <small>{catalog.entriesFor(option.kind).length}</small>
          </button>
        ))}
      </div>
      <div className="relay-context-summary">
        {t("当前共有")} {visibleEntries.length} {t("个")}{label}{t("；这些条目独立于供应商保存，会写入所有供应商切换后的 config.toml。")}
      </div>
      <div className="relay-context-list">
        {visibleEntries.length ? (
          visibleEntries.map((entry) => (
            <div className="relay-context-row" key={`${entry.kind}-${entry.id}`}>
              <strong className="context-title">{entry.title || entry.id}</strong>
              <div className="relay-context-actions">
                <button
                  aria-checked={entry.enabled}
                  aria-label={`contextEnabledSwitch-${entry.kind}-${entry.id}`}
                  className={`context-enabled-switch ${entry.enabled ? "active" : ""}`}
                  disabled={pending}
                  onClick={() => void applyContextChange({ type: "toggle", entry })}
                  role="switch"
                  title={entry.enabled ? t("禁用此扩展项") : t("启用此扩展项")}
                  type="button"
                >
                  <span className="context-switch-track" aria-hidden="true">
                    <span className="context-switch-thumb" />
                  </span>
                </button>
                <Button disabled={pending} onClick={() => setEditor({ kind: entry.kind, entry })} size="icon" title={t("编辑扩展项")} variant="ghost">
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  className="relay-context-delete"
                  disabled={pending}
                  onClick={() => void applyContextChange({ type: "delete", kind: entry.kind, id: entry.id })}
                  size="icon"
                  title={t("删除扩展项")}
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">{t("暂无")}{label}{t("，可以从通用配置文件或这里新增。")}</div>
        )}
      </div>
      {editor ? (
        <ContextEntryEditor
          entry={editor.entry}
          kind={editor.kind}
          onCancel={() => setEditor(null)}
          onSave={(kind, id, tomlBody) => void applyContextChange(
            { type: "save", kind, id, tomlBody },
            () => setEditor(null),
          )}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

function ContextEntryEditor({
  kind,
  entry,
  onCancel,
  onSave,
  pending,
}: {
  kind: ContextKind;
  entry?: ContextEntry;
  onCancel: () => void;
  onSave: (kind: ContextKind, id: string, tomlBody: string) => void;
  pending: boolean;
}) {
  const [draftKind, setDraftKind] = useState<ContextKind>(entry?.kind ?? kind);
  const [id, setId] = useState(entry?.id ?? "");
  const [tomlBody, setTomlBody] = useState(entry?.tomlBody ?? "");
  const canSave = id.trim().length > 0;

  return (
    <div className="context-editor">
      <div className="context-editor-fields">
        <Field label={t("类型")}>
          <select
            className="field-select"
            disabled={!!entry || pending}
            value={draftKind}
            onChange={(event) => {
              const nextKind = parseContextKind(event.currentTarget.value);
              if (nextKind) setDraftKind(nextKind);
            }}
          >
            {contextKindOptions.map((option) => (
              <option key={option.kind} value={option.kind}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="ID">
          <Input
            disabled={!!entry || pending}
            value={id}
            onChange={(event) => setId(event.currentTarget.value.trim())}
            placeholder={t("例如 context7")}
          />
        </Field>
      </div>
      <Field label={t("TOML 配置体")}>
        <Textarea
          className="context-editor-textarea"
          disabled={pending}
          value={tomlBody}
          onChange={(event) => setTomlBody(event.currentTarget.value)}
          placeholder={t("只填写表头下面的内容，例如：\ncommand = \"pnpm\"\nargs = [\"dlx\", \"@upstash/context7-mcp\"]")}
          spellCheck={false}
        />
      </Field>
      <Toolbar>
        <Button disabled={!canSave || pending} onClick={() => onSave(draftKind, id.trim(), tomlBody)} size="sm">
          <Save className="h-4 w-4" />
          {pending ? t("正在保存…") : t("保存扩展项")}
        </Button>
        <Button disabled={pending} onClick={onCancel} size="sm" variant="secondary">{t("取消")}</Button>
      </Toolbar>
    </div>
  );
}

function contextKindLabel(kind: ContextKind): string {
  return contextKindOptions.find((option) => option.kind === kind)?.label ?? t("扩展项");
}

function parseContextKind(value: string): ContextKind | null {
  return value === "mcp" || value === "skill" || value === "plugin" ? value : null;
}
