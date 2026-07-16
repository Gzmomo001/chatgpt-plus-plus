import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type RelayProfileComboboxOption<Value extends string> = {
  value: Value;
  label: string;
};

export function RelayProfileCombobox<Value extends string>({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  onChange: (value: Value) => void;
  options: readonly RelayProfileComboboxOption<Value>[];
  value: Value;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="relay-combobox" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="relay-combobox-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        type="button"
      >
        <span>{selected?.label}</span>
        <ChevronDown aria-hidden="true" className={`relay-combobox-chevron ${open ? "open" : ""}`} />
      </button>
      {open ? (
        <div aria-label={ariaLabel} className="relay-combobox-menu" role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={`relay-combobox-option ${option.value === value ? "selected" : ""}`}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
              {option.value === value ? <Check aria-hidden="true" className="h-4 w-4" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
