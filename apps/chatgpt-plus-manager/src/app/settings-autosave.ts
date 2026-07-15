export type SettingsAutosaveState = "idle" | "pending" | "saving" | "saved" | "failed";

type SettingsAutosaveOptions<Value, Result> = {
  delayMs?: number;
  save: (value: Value) => Promise<Result>;
  onSaved: (result: Result, value: Value) => void;
  onError: (error: unknown, value: Value) => void;
  onStateChange: (state: SettingsAutosaveState) => void;
  scheduleTimer?: (callback: () => void, delayMs: number) => unknown;
  cancelTimer?: (timer: unknown) => void;
};

export function createSettingsAutosave<Value, Result>({
  delayMs = 450,
  save,
  onSaved,
  onError,
  onStateChange,
  scheduleTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancelTimer = (timer) => globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>),
}: SettingsAutosaveOptions<Value, Result>) {
  let state: SettingsAutosaveState = "idle";
  let timer: unknown = null;
  let pending: Value | null = null;
  let saving = false;
  let disposed = false;

  const emit = (next: SettingsAutosaveState) => {
    if (state === next) return;
    state = next;
    onStateChange(next);
  };

  const drain = async () => {
    timer = null;
    if (disposed || saving || pending === null) return;

    const value = pending;
    pending = null;
    saving = true;
    emit("saving");
    let failed = false;
    try {
      const result = await save(value);
      if (!disposed) onSaved(result, value);
    } catch (error) {
      failed = true;
      if (!disposed) onError(error, value);
    } finally {
      saving = false;
      if (disposed) return;
      if (pending !== null) {
        emit("pending");
        if (timer === null) void drain();
      } else {
        emit(failed ? "failed" : "saved");
      }
    }
  };

  return {
    schedule(value: Value) {
      if (disposed) return;
      pending = value;
      emit("pending");
      if (timer !== null) cancelTimer(timer);
      timer = scheduleTimer(() => void drain(), delayMs);
    },
    saveNow(value: Value) {
      if (disposed) return;
      pending = value;
      emit("pending");
      if (timer !== null) cancelTimer(timer);
      timer = null;
      void drain();
    },
    dispose() {
      disposed = true;
      pending = null;
      if (timer !== null) cancelTimer(timer);
      timer = null;
    },
  };
}
