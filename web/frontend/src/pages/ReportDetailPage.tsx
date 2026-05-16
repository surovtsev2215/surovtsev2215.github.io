import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ClipboardList, FileText, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { deleteReport, fetchReportById } from "../lib/reportStore";
import { canDeleteReport, canEditReport, getReportStatus } from "../lib/reportPermissions";
import { ReportReviewNotice } from "../components/reports/ReportReviewNotice";
import { ReportStatusBadge } from "../components/reports/ReportStatusBadge";
import { formatLineNames } from "../lib/reportAggregations";
import { formatWorkSummaryLine, getReportWorkSummary, groupPipesByWorkKind, PIPE_WORK_LABELS } from "../lib/pipeWorkKind";
import { LazyReportPhotoThumb } from "../components/reports/LazyReportPhotoThumb";
import { ReportPipeCard } from "../components/reports/ReportPipeCard";
import type { PipeWorkKind } from "../types";
import { submitReportReview } from "../lib/reviewApi";
import { isApiConfigured } from "../lib/runtimeConfig";
import type { Report, ReportReviewStatus } from "../types";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Skeleton } from "../components/ui/skeleton";
import { TaskDialog } from "../components/itr/TaskDialog";
import { useUsersDirectory } from "../hooks/useUsersDirectory";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";
import { collectUniqueCrewFromReport, formatCrewLine } from "../lib/brigade";

const SECTION_ORDER: PipeWorkKind[] = ["shift_foil", "pipeline_mount", "equipment_mount", "pipeline_demount"];

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const usersDirectory = useUsersDirectory();
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const openLightbox = useCallback((url: string) => setLightbox(url), []);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState<null | ReportReviewStatus>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await fetchReportById(id);
        if (!cancelled) {
          setReport(row);
          if (row?.review?.note) setReviewNote(row.review.note);
        }
      } catch {
        if (!cancelled) setReport(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const author = useMemo(() => {
    if (!report) return undefined;
    return usersDirectory.byUid(report.userId);
  }, [report, usersDirectory]);

  async function handleReview(status: ReportReviewStatus) {
    if (!report?.id) return;
    setReviewSubmitting(status);
    try {
      const updated = await submitReportReview(report.id, status, reviewNote.trim() || undefined);
      if (updated) {
        setReport(updated);
        toast.success(
          status === "approved"
            ? "Отчёт согласован"
            : status === "needs_fix"
              ? "Отчёт возвращён на доработку"
              : "Статус сброшен"
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить решение");
    } finally {
      setReviewSubmitting(null);
    }
  }

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
          <Link to={role === "admin" ? "/admin/users" : role === "director" ? "/director/reports" : "/history"}>
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
    role === "admin" ? "/admin/users" : role === "director" ? directorBack ?? "/director/reports" : "/history";

  const status = getReportStatus(report);
  const canReview = (role === "director" || role === "admin") && isApiConfigured;
  const canTask = canReview;
  const canEdit = canEditReport(report, profile?.uid, role);
  const canDelete = canDeleteReport(report, profile?.uid, role);
  const isIsolatorOwner = role !== "admin" && role !== "director" && report.userId === profile?.uid;

  const reportId = report.id;
  const reportDate = report.date;

  async function handleDelete() {
    if (!reportId || !canDelete) return;
    const ok = window.confirm(`Удалить отчёт за ${reportDate}? Это действие нельзя отменить.`);
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteReport(reportId);
      toast.success("Отчёт удалён");
      navigate(backTo, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить отчёт");
    } finally {
      setDeleting(false);
    }
  }
  const authorDisplay = author?.fullName ? formatFullNameForDisplay(author.fullName) : report.userEmail;
  const crewSummary = formatCrewLine(collectUniqueCrewFromReport(report));
  const submittedByDisplay = report.submittedByFullName
    ? formatFullNameForDisplay(report.submittedByFullName)
    : authorDisplay;
  const reportLabel = `${report.date} · ${formatLineNames(report)}`;

  const hasShiftExtras =
    !!report.shiftWorkDescription?.trim() ||
    !!report.shiftWorkPhotoUrls?.length ||
    !!report.shiftWorkPipes?.length;

  return (
    <div className="page-stack">
      <div className="surface-highlight surface-hero-light animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">Карточка отчёта</h2>
            <p className="mt-1 truncate text-sm text-slate-100/90">
              {report.date} · {authorDisplay}
              {author?.position ? ` · ${author.position}` : ""}
            </p>
            {report.isBrigadeReport ? (
              <p className="mt-1 text-xs text-slate-100/85">
                Отчёт бригады
                {report.brigadeNumber ? ` № ${report.brigadeNumber}` : ""}
                {submittedByDisplay ? ` · подал ${submittedByDisplay}` : ""}
              </p>
            ) : null}
            {crewSummary ? (
              <p className="mt-1 text-xs text-slate-100/80">Участники: {crewSummary}</p>
            ) : null}
            <div className="mt-2">
              <ReportStatusBadge status={status} />
            </div>
          </div>
          <FileText className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>
      <div className="surface-floating itr-panel itr-priority-info flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
        <h3 className="section-title text-sm uppercase tracking-wide">Отчёт</h3>
        <div className="flex flex-wrap gap-2">
          {canTask && (
            <Button variant="secondary" size="sm" onClick={() => setTaskDialogOpen(true)}>
              <ClipboardList className="h-4 w-4" aria-hidden /> Поставить задачу
            </Button>
          )}
          {canEdit ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/form?edit=${encodeURIComponent(report.id!)}`)}
            >
              <Pencil className="h-4 w-4" aria-hidden /> Изменить
            </Button>
          ) : null}
          {canDelete ? (
            <Button variant="outline" size="sm" disabled={deleting} onClick={() => void handleDelete()}>
              <Trash2 className="h-4 w-4" aria-hidden /> {deleting ? "Удаление…" : "Удалить"}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" asChild>
            <Link to={backTo}>← Назад</Link>
          </Button>
        </div>
      </div>

      {isIsolatorOwner ? <ReportReviewNotice report={report} /> : null}

      {canReview && (
        <Card className="soft-ring surface-floating">
          <CardHeader>
            <CardTitle className="text-base">Решение ИТР</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.review ? (
              <div className="pretty-list-item p-3 text-sm">
                <div className="text-xs text-slate-500 theme-dark:text-slate-400">
                  {formatFullNameForDisplay(report.review.byFullName || "")}
                  {report.review.byPosition ? ` · ${report.review.byPosition}` : ""}
                  {" · "}
                  {new Date(report.review.decidedAt).toLocaleString("ru-RU")}
                </div>
                {report.review.note ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{report.review.note}</p>
                ) : null}
              </div>
            ) : null}
            <textarea
              className="min-h-[80px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
              placeholder="Комментарий к решению (опционально, обязателен при возврате на доработку)"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={reviewSubmitting !== null}
                onClick={() => void handleReview("approved")}
              >
                {reviewSubmitting === "approved" ? "Сохранение…" : "Согласовать"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={reviewSubmitting !== null}
                onClick={() => {
                  if (!reviewNote.trim()) {
                    toast.error("Укажите причину возврата на доработку.");
                    return;
                  }
                  void handleReview("needs_fix");
                }}
              >
                {reviewSubmitting === "needs_fix" ? "Сохранение…" : "Вернуть на доработку"}
              </Button>
              {status !== "submitted" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={reviewSubmitting !== null}
                  onClick={() => void handleReview("submitted")}
                >
                  Сбросить статус
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {hasShiftExtras ? (
        <Card className="soft-ring surface-floating animate-in-up">
          <CardHeader>
            <CardTitle className="text-base">Работа за смену</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                      <LazyReportPhotoThumb
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
      ) : null}

      {(() => {
        const grouped = groupPipesByWorkKind(report.pipes);
        const workSummary = getReportWorkSummary(report);
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 theme-dark:text-slate-300">
              {formatWorkSummaryLine(workSummary)}
              {workSummary.photoCount > 0 ? ` · фото: ${workSummary.photoCount}` : ""}
            </p>
            {SECTION_ORDER.map((kind) => {
              const list = grouped.get(kind) ?? [];
              if (!list.length) return null;
              return (
                <section key={kind} className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-800 theme-dark:text-slate-100">
                    {PIPE_WORK_LABELS[kind].section}
                  </h3>
                  {list.map((pipe, idx) => (
                    <ReportPipeCard
                      key={pipe.id || idx}
                      pipe={pipe}
                      index={idx}
                      workBlock={report.fullName}
                      onOpenPhoto={openLightbox}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        );
      })()}

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

      {canTask && report.id ? (
        <TaskDialog
          open={taskDialogOpen}
          onOpenChange={setTaskDialogOpen}
          defaultAssigneeUid={report.userId}
          defaultRelatedReportId={report.id}
          defaultRelatedReportLabel={reportLabel}
        />
      ) : null}
    </div>
  );
}
