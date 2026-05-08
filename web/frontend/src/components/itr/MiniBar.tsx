interface MiniBarProps {
  data: Array<{ label: string; value: number }>;
  height?: number;
  emptyText?: string;
  formatValue?: (value: number) => string;
}

export function MiniBar({ data, height = 80, emptyText = "Нет данных", formatValue }: MiniBarProps) {
  if (!data.length) {
    return (
      <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-500 theme-dark:border-slate-700 theme-dark:text-slate-400">
        {emptyText}
      </div>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  const width = Math.max(120, data.length * 22);
  const barWidth = Math.max(8, width / data.length - 4);
  const padding = 6;
  const innerHeight = height - padding * 2;
  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="График по дням"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {data.map((d, i) => {
          const h = (d.value / max) * innerHeight;
          const x = i * (barWidth + 4) + padding / 2;
          const y = height - padding - h;
          return (
            <g key={`${d.label}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={3}
                className="fill-primary/70 theme-dark:fill-accent/80"
              >
                <title>
                  {d.label}: {formatValue ? formatValue(d.value) : d.value}
                </title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500 theme-dark:text-slate-400">
        <span>{data[0]?.label}</span>
        {data.length > 1 ? <span>{data[data.length - 1]?.label}</span> : null}
      </div>
    </div>
  );
}
