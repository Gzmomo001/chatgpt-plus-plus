import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, Copy, Edit3, GripVertical, TestTube, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { t, tf } from "@/i18n";
import { commitRelayChanges } from "../controller";
import { edit, open as openProfileEditor } from "../editor";
import {
  providerInitial,
  relayModeLabel,
  relayProfileConfigBrief,
  relayProtocolLabel,
} from "../presentation";
import type {
  RelayProfileActions,
  RelayProfileView,
  RelaySettings,
} from "../contracts";
import type {
  RelayContextSelection,
  RelayProfileEdit,
  ReconciledRelayProfileSettings,
} from "../types";

type RelayProfileListProps<Settings extends RelaySettings> = {
  form: Settings;
  defaultContextSelection: RelayContextSelection;
  onFormChange: (value: ReconciledRelayProfileSettings<Settings>) => void;
  onEdit: (id: string) => void;
  disabled: boolean;
  actions: RelayProfileActions<Settings>;
};

export function RelayProfileList<Settings extends RelaySettings>({
  form,
  defaultContextSelection,
  onFormChange,
  onEdit,
  disabled,
  actions,
}: RelayProfileListProps<Settings>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const profileId = String(event.active.id);
    const state = openProfileEditor({
      settings: form,
      defaultContextSelection,
      focus: { type: "existing", profileId },
    });
    const result = commitRelayChanges(edit(state, {
      type: "reorder",
      profileId,
      targetId: String(event.over.id),
    }), form);
    if (result.ok && result.effect.type !== "switchProfile") {
      void onFormChange(result.settings);
    }
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={form.relayProfiles.map((profile) => profile.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="relay-profile-list">
          {form.relayProfiles.map((profile, index) => (
            <SortableRelayProfileCard
              key={profile.id}
              form={form}
              defaultContextSelection={defaultContextSelection}
              profile={profile}
              index={index}
              onFormChange={onFormChange}
              onEdit={onEdit}
              disabled={disabled}
              actions={actions}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRelayProfileCard<Settings extends RelaySettings>({
  form,
  defaultContextSelection,
  profile,
  onFormChange,
  onEdit,
  disabled,
  actions,
}: RelayProfileListProps<Settings> & { profile: RelayProfileView; index: number }) {
  const sortable = useSortable({ id: profile.id });
  const active = profile.id === form.activeRelayId;
  const style: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const commitIntent = (intent: RelayProfileEdit) => commitRelayChanges(
    edit(openProfileEditor({
      settings: form,
      defaultContextSelection,
      focus: { type: "existing", profileId: profile.id },
    }), intent),
    form,
  );
  return (
    <div
      className={`relay-profile-card ${active ? "active" : ""} ${sortable.isDragging ? "dragging" : ""}`}
      data-relay-profile-id={profile.id}
      onKeyDown={(event) => {
        if (event.key === "Enter") onEdit(profile.id);
      }}
      ref={sortable.setNodeRef}
      style={style}
      tabIndex={0}
    >
      <button
        aria-label={t("拖动排序")}
        className="relay-drag"
        title={t("拖动排序")}
        type="button"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="relay-index" title={profile.name || t("未命名供应商")}>
        {providerInitial(profile.name)}
      </span>
      <span className="relay-summary">
        <strong>{profile.name || t("未命名供应商")}</strong>
        <small>
          {relayModeLabel(profile.relayMode)} · {relayProtocolLabel(profile.protocol)} · {relayProfileConfigBrief(profile)}
        </small>
      </span>
      <span className="relay-card-actions">
        <Button
          className={`relay-use-button ${active ? "active" : ""}`}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            const result = commitIntent({ type: "activate", profileId: profile.id });
            if (result.ok && result.effect.type === "switchProfile") {
              void actions.switchRelayProfile(result.settings, result.effect.profileId);
            }
          }}
          size="sm"
          title={disabled ? t("供应商切换不可用") : active ? t("当前正在使用") : t("设为当前")}
          variant={active ? "secondary" : "outline"}
        >
          <CheckCircle2 className="h-4 w-4" />
          {active ? t("使用中") : t("使用")}
        </Button>
        <span className="relay-card-extra">
          <Button
            disabled={profile.relayMode === "aggregate"}
            onClick={(event) => {
              event.stopPropagation();
              if (profile.relayMode !== "aggregate") void actions.testRelayProfile(profile);
            }}
            size="icon"
            title={profile.relayMode === "aggregate"
              ? t("聚合供应商会在真实对话中轮转成员，请测试成员供应商")
              : t("发送 hi 测试")}
            variant="ghost"
          >
            <TestTube className="h-4 w-4" />
          </Button>
          <Button
            onClick={(event) => { event.stopPropagation(); onEdit(profile.id); }}
            size="icon"
            title={t("编辑")}
            variant="ghost"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            onClick={(event) => {
              event.stopPropagation();
              const result = commitIntent({
                type: "duplicate",
                profileId: profile.id,
                id: `relay-${Date.now().toString(36)}`,
                name: tf("{0} 副本", [profile.name || t("未命名供应商")]),
              });
              if (result.ok && result.effect.type !== "switchProfile") {
                void onFormChange(result.settings);
              }
            }}
            size="icon"
            title={t("复制")}
            variant="ghost"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            disabled={form.relayProfiles.length <= 1}
            onClick={(event) => {
              event.stopPropagation();
              const result = commitIntent({ type: "remove", profileId: profile.id });
              if (result.ok && result.effect.type !== "switchProfile") {
                void onFormChange(result.settings);
              }
            }}
            size="icon"
            title={t("删除供应商")}
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </span>
      </span>
    </div>
  );
}
