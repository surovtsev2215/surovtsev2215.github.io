import { Button } from "../ui/button";
import type { PeriodPreset } from "../../hooks/useItrPeriod";

interface PeriodSwitcherProps {
  preset: PeriodPreset;
  onChange: (preset: PeriodPreset) => void;
}

const items: { label: string; value: PeriodPreset }[] = [
  { label: "Сегодня", value: "today" },
  { label: "7 дней", value: 7 },
  { label: "30 дней", value: 30 },
  { label: "Всё", value: "all" }
];

export function PeriodSwitcher({ preset, onChange }: PeriodSwitcherProps) {
  return (
    <div className="flex w-full flex-wrap gap-2">
      {items.map((item) => (
        <Button
          key={item.label}
          type="button"
          size="sm"
          className="min-w-0 flex-1 sm:flex-none"
          variant={preset === item.value ? "default" : "secondary"}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
