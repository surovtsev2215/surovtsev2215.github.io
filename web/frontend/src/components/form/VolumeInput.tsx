import { useEffect, useState } from "react";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";

function parseDecimal(raw: string): number | undefined {
  const t = raw.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

type VolumeInputProps = {
  id?: string;
  value?: number;
  onValueChange: (value: number | undefined) => void;
  placeholder?: string;
  unit?: string;
  min?: number;
  invalid?: boolean;
  className?: string;
};

export function VolumeInput({
  id,
  value,
  onValueChange,
  placeholder = "0",
  unit,
  min = 0.1,
  invalid,
  className
}: VolumeInputProps) {
  const [text, setText] = useState(() =>
    value != null && value > 0 ? String(value).replace(".", ",") : ""
  );

  useEffect(() => {
    const external =
      value != null && value > 0 ? String(value).replace(".", ",") : "";
    setText((prev) => {
      const parsed = parseDecimal(prev);
      if (parsed === value || (parsed == null && (value == null || value <= 0))) {
        return prev;
      }
      return external;
    });
  }, [value]);

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const parsed = parseDecimal(next);
          if (parsed == null) {
            onValueChange(undefined);
            return;
          }
          onValueChange(parsed);
        }}
        onBlur={() => {
          const parsed = parseDecimal(text);
          if (parsed == null) {
            setText("");
            onValueChange(undefined);
            return;
          }
          if (min > 0 && parsed < min) {
            onValueChange(undefined);
            setText("");
            return;
          }
          const normalized = String(parsed).replace(".", ",");
          setText(normalized);
          onValueChange(parsed);
        }}
        className={cn(
          invalid ? "border-amber-300 theme-dark:border-amber-700" : "",
          unit ? "pr-10" : "",
          className
        )}
      />
      {unit ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 theme-dark:text-slate-500">
          {unit}
        </span>
      ) : null}
    </div>
  );
}
