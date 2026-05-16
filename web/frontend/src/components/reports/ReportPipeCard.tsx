import { memo, useState } from "react";
import type { PipeEntry } from "../../types";
import { getPipeDisplayFields, inferPipeWorkKind } from "../../lib/pipeWorkKind";
import { WorkKindBadge } from "./WorkKindBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

function ReportPhotoThumb({
  url,
  index,
  onOpen
}: {
  url: string;
  index: number;
  onOpen: () => void;
}) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed p-2 text-center text-xs text-slate-500">
        Фото недоступно
      </div>
    );
  }
  return (
    <button
      type="button"
      className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary theme-dark:border-slate-600"
      onClick={onOpen}
    >
      <img
        src={url}
        alt={`Фото ${index + 1}`}
        className="h-full w-full object-cover transition group-hover:scale-105"
        onError={() => setOk(false)}
      />
    </button>
  );
}

export const ReportPipeCard = memo(function ReportPipeCard({
  pipe,
  index,
  workBlock,
  onOpenPhoto
}: {
  pipe: PipeEntry;
  index: number;
  workBlock?: string;
  onOpenPhoto: (url: string) => void;
}) {
  const kind = inferPipeWorkKind(pipe);
  const fields = getPipeDisplayFields(pipe, workBlock);
  const titlePrefix =
    kind === "equipment_mount"
      ? "Оборудование"
      : kind === "pipeline_demount"
        ? "Демонтаж"
        : kind === "shift_foil"
          ? "Фольга-ткань"
          : "Труба";

  return (
    <Card className="soft-ring surface-floating animate-in-up">
      <CardHeader className="space-y-2">
        <WorkKindBadge kind={kind} />
        <CardTitle className="text-base">
          {titlePrefix} №{index + 1}
          {pipe.siteName ? ` · ${pipe.siteName}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs text-slate-500 theme-dark:text-slate-400">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {!!pipe.comments && (
          <div>
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Комментарии</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{pipe.comments}</p>
          </div>
        )}
        {!!pipe.photoUrls?.length && (
          <div>
            <div className="mb-2 text-xs text-slate-500 theme-dark:text-slate-400">
              Фото ({pipe.photoUrls.length})
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {pipe.photoUrls.map((url, i) => (
                <ReportPhotoThumb key={`${url}-${i}`} url={url} index={i} onOpen={() => onOpenPhoto(url)} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
