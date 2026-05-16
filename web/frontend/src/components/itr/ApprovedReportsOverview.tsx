import { CheckCircle2 } from "lucide-react";
import { WidgetCard } from "./WidgetCard";
import { StatTile } from "./StatTile";
import { Skeleton } from "../ui/skeleton";
import { Button } from "../ui/button";
import type { ApprovedReportsSummary } from "../../lib/approvedReportsSummary";

type ApprovedReportsOverviewProps = {
  summary: ApprovedReportsSummary;
  periodLabel: string;
  loading?: boolean;
  filterActive?: boolean;
  onShowApproved?: () => void;
};

export function ApprovedReportsOverview({
  summary,
  periodLabel,
  loading,
  filterActive,
  onShowApproved
}: ApprovedReportsOverviewProps) {
  if (loading) {
    return <Skeleton className="h-28 w-full rounded-xl" />;
  }

  return (
    <WidgetCard
      title="Согласованные отчёты"
      description={`Сводка ${periodLabel} — только со статусом «Согласован»`}
      Icon={CheckCircle2}
      badge={summary.reportsCount}
      badgeTone="success"
      className="itr-panel border-emerald-200/80 theme-dark:border-emerald-900/50"
    >
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            tone="emerald"
            label="Отчётов"
            value={String(summary.reportsCount)}
            hint={
              summary.uniqueBlocks > 0
                ? `${summary.uniqueBlocks} блок${summary.uniqueBlocks === 1 ? "" : summary.uniqueBlocks < 5 ? "а" : "ов"}`
                : undefined
            }
          />
          <StatTile
            tone="violet"
            label="ТИ труб"
            value={summary.pipelineMountM2 > 0 ? `${summary.pipelineMountM2} м²` : "—"}
          />
          <StatTile
            tone="amber"
            label="Демонтаж"
            value={summary.demountM2 > 0 ? `${summary.demountM2} м²` : "—"}
          />
          <StatTile
            tone="sky"
            label="ТИ оборудования"
            value={summary.equipmentMountM2 > 0 ? `${summary.equipmentMountM2} м²` : "—"}
          />
        </div>

        {summary.topBlocks.length > 0 ? (
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500 theme-dark:text-slate-400">
              Блоки производства
            </div>
            <div className="flex flex-wrap gap-1.5">
              {summary.topBlocks.map(({ block, count }) => (
                <span
                  key={block}
                  className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 theme-dark:border-emerald-800 theme-dark:bg-emerald-950/40 theme-dark:text-emerald-200"
                >
                  {block}
                  <span className="ml-1 opacity-70">({count})</span>
                </span>
              ))}
            </div>
          </div>
        ) : summary.reportsCount > 0 ? (
          <p className="text-xs text-slate-500 theme-dark:text-slate-400">Блок не указан в отчётах</p>
        ) : null}

        {onShowApproved ? (
          <Button
            type="button"
            variant={filterActive ? "default" : "secondary"}
            size="sm"
            className="w-full sm:w-auto"
            onClick={onShowApproved}
          >
            {filterActive ? "Показан список согласованных" : "Открыть список согласованных"}
          </Button>
        ) : null}
      </div>
    </WidgetCard>
  );
}
