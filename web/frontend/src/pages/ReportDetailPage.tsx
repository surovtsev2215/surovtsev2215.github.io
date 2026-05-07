import { memo, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { FileText } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { fetchReportById } from "../lib/reportStore";
import { getReportPipeCount, getReportTotalLength } from "../lib/reportAggregations";
import type { PipeEntry, Report } from "../types";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Skeleton } from "../components/ui/skeleton";

const ReportPhotoThumb = memo(function ReportPhotoThumb({
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
      <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2 text-center text-xs text-slate-500 theme-dark:border-slate-600 theme-dark:bg-slate-800 theme-dark:text-slate-400">
        Фото недоступно (устаревшая или битая ссылка)
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
});

const PipeCard = memo(function PipeCard({
  pipe,
  index,
  onOpenPhoto
}: {
  pipe: PipeEntry;
  index: number;
  onOpenPhoto: (url: string) => void;
}) {
  const fields: { label: string; value: string }[] = [
    { label: "Линия трубопровода", value: pipe.siteName || "—" },
    { label: "Диаметр", value: pipe.diameter ? `${String(pipe.diameter).replace(".", ",")} мм` : "—" },
    { label: "Тип изоляции", value: pipe.insulationType || "—" },
    { label: "Стыки", value: String(pipe.jointsCount ?? 0) },
    { label: "Длина одной трубы", value: `${pipe.pipeLength ?? 0} м` },
    { label: "Суммарная длина", value: `${pipe.totalLength ?? 0} м` }
  ];

  return (
    <Card className="soft-ring animate-in-up">
      <CardHeader>
        <CardTitle className="text-base">
          Труба №{index + 1}
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
                <ReportPhotoThumb
                  key={`${url}-${i}`}
                  url={url}
                  index={i}
                  onOpen={() => onOpenPhoto(url)}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { profile, role } = useAuth();
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const openLightbox = useCallback((url: string) => setLightbox(url), []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await fetchReportById(id);
        if (!cancelled) setReport(row);
      } catch {
        if (!cancelled) setReport(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (report === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!report || !id) {
    return (
      <div className="space-y-4">
        <p className="text-slate-600 theme-dark:text-slate-300">Отчёт не найден.</p>
        <Button variant="secondary" asChild>
          <Link to={role === "admin" ? "/admin/dashboard" : role === "director" ? "/director/reports" : "/history"}>
            Назад к списку
          </Link>
        </Button>
      </div>
    );
  }

  if (role !== "admin" && role !== "director" && report.userId !== profile?.uid) {
    return <Navigate to="/history" replace />;
  }

  const directorBack = (location.state as { directorBackTo?: string } | null)?.directorBackTo;
  const backTo =
    role === "admin" ? "/admin/dashboard" : role === "director" ? directorBack ?? "/director/reports" : "/history";

  const pipeCount = getReportPipeCount(report);
  const totalLen = getReportTotalLength(report);

  let shiftValueText = "—";
  if (report.shiftWork && report.shiftWork.value > 0) {
    shiftValueText =
      report.shiftWork.type === "hours"
        ? `${report.shiftWork.value} дн`
        : `${report.shiftWork.value} ₽`;
  }

  const commonFields: { label: string; value: string }[] = [
    { label: "Дата", value: report.date },
    { label: "Блок производства работ", value: report.fullName || "—" },
    { label: "Учёт смены", value: shiftValueText },
    { label: "Труб в смене", value: `${pipeCount} (Σ ${totalLen.toFixed(1)} м)` },
    { label: "Служебный email", value: report.userEmail }
  ];

  return (
    <div className="page-stack">
      <div className="surface-highlight animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Карточка отчёта</h2>
            <p className="mt-1 text-sm text-slate-100/90">Общие данные смены и параметры по каждой трубе.</p>
          </div>
          <FileText className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>
      <div className="content-section flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-title text-sm uppercase tracking-wide">Отчёт</h3>
        <Button variant="secondary" size="sm" className="w-full sm:w-auto" asChild>
          <Link to={backTo}>← Назад</Link>
        </Button>
      </div>

      <Card className="soft-ring animate-in-up">
        <CardHeader>
          <CardTitle>Общие данные</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            {commonFields.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs text-slate-500 theme-dark:text-slate-400">{label}</dt>
                <dd className="text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {(report.shiftWorkDescription || report.shiftWorkPhotoUrls?.length) && (
            <div className="space-y-3">
              {!!report.shiftWorkDescription && (
                <div>
                  <div className="text-xs text-slate-500 theme-dark:text-slate-400">
                    Описание работы изолировщика
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{report.shiftWorkDescription}</p>
                </div>
              )}
              {!!report.shiftWorkPhotoUrls?.length && (
                <div>
                  <div className="text-xs text-slate-500 theme-dark:text-slate-400">
                    Фото работы ({report.shiftWorkPhotoUrls.length})
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {report.shiftWorkPhotoUrls.map((url, i) => (
                      <ReportPhotoThumb
                        key={`${url}-${i}`}
                        url={url}
                        index={i}
                        onOpen={() => openLightbox(url)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {!!report.shiftWorkPipes?.length && (
            <div>
              <div className="text-xs text-slate-500 theme-dark:text-slate-400">
                Трубы для фиксации смены
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {report.shiftWorkPipes.map((name, idx) => (
                  <li key={`${name}-${idx}`}>{name}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {report.pipes.map((pipe, idx) => (
          <PipeCard
            key={pipe.id || idx}
            pipe={pipe}
            index={idx}
            onOpenPhoto={openLightbox}
          />
        ))}
      </div>

      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto p-4">
          <DialogTitle className="sr-only">Просмотр фото</DialogTitle>
          {lightbox && (
            <img
              src={lightbox}
              alt="Просмотр"
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
