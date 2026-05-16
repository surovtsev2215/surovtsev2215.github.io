import { useEffect, useState, type ReactNode } from "react";
import { cn, toTodayInputValue } from "../lib/utils";
import { useAuth } from "../contexts/AuthContext";
import { createReport, subscribeReportsByUser } from "../lib/reportStore";
import { toast } from "sonner";
import type { PipeEntry, Report, ShiftWorkType } from "../types";
import { makePhotoPreview, revokePhotoPreview, uploadReportPhotos } from "../lib/photoUpload";
import { syntheticEmailForUid } from "../lib/syntheticUserEmail";
import {
  ClipboardList,
  Clock3,
  Plus,
  Sparkles,
  Trash2,
  Wrench
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent } from "../components/ui/card";
import { usePipeList, type PipeDraft } from "../hooks/usePipeList";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";
import { VolumeInput } from "../components/form/VolumeInput";
import { PhotoAttachField } from "../components/form/PhotoAttachField";
import {
  collectPhotoCardsWithoutValidData,
  isValidDemountCard,
  isValidWorkCard
} from "../lib/formValidation";
import type { PipeWorkKind } from "../types";

const diameters = [
  17.1,
  21.3,
  26,
  26.7,
  33.4,
  48.3,
  57,
  60.3,
  88.9,
  108,
  114.3,
  168.3,
  219.1,
  273,
  323.8,
  355.6,
  406.4,
  457,
  508,
  547,
  610,
  660,
  762,
  914
];
const insulationTypes = ["60 мм", "70 мм", "80 мм", "90 мм", "100 мм", "110 мм", "120 мм"];
const aluminumThicknessOptions = [0.5, 0.8, 1.0];
const workBlocks = [
  "311A",
  "311B",
  "311C",
  "311T",
  "312A",
  "312B",
  "312C",
  "312T",
  "313A",
  "313B",
  "313C",
  "313T",
  "314A",
  "314B",
  "314C",
  "314T",
  "315A",
  "315B",
  "315C",
  "315T",
  "315X",
  "411A",
  "411B",
  "411C",
  "411E",
  "411F",
  "411G",
  "411Q",
  "411X",
  "411Z",
  "411D"
];
const DRAFT_KEY = "pto-form-draft-v4";
const MAX_PHOTOS_PER_PIPE = 10;

const selectClass = cn(
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 theme-dark:border-slate-700 theme-dark:bg-slate-900 theme-dark:text-slate-100 theme-dark:ring-offset-slate-950"
);

function pipeTotal(p: PipeDraft): number {
  return Number(((p.jointsCount ?? 0) * (p.pipeLength ?? 0)).toFixed(2));
}

function scrollToFirstInvalidField() {
  const invalid = document.querySelector<HTMLElement>(
    "input.border-amber-300, select.border-amber-300, textarea.border-amber-300"
  );
  if (!invalid) return;
  invalid.scrollIntoView({ behavior: "smooth", block: "center" });
  requestAnimationFrame(() => invalid.focus());
}

function StepSection({
  icon,
  title,
  subtitle,
  children
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Card className="surface-floating animate-in-up overflow-hidden border border-slate-300/90 bg-slate-100/90 shadow-sm theme-dark:border-slate-700/90 theme-dark:bg-slate-900/80">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="section-title text-base">{title}</h3>
            {subtitle && <p className="section-subtitle mt-1">{subtitle}</p>}
          </div>
          <div className="rounded-lg border border-slate-300 bg-slate-200/70 p-2 text-primary theme-dark:border-slate-700 theme-dark:bg-slate-800/70 theme-dark:text-accent">
            {icon}
          </div>
        </div>
        <div className="divider-fade" />
        {children}
      </CardContent>
    </Card>
  );
}

export function FormPage() {
  const { profile } = useAuth();
  const [date, setDate] = useState(toTodayInputValue());
  const [fullName, setFullName] = useState("");
  const shiftPipeList = usePipeList({ maxPhotosPerPipe: MAX_PHOTOS_PER_PIPE });
  const pipelinePipeList = usePipeList({ defaultJointsCount: 0, maxPhotosPerPipe: MAX_PHOTOS_PER_PIPE });
  const equipmentPipeList = usePipeList({ defaultJointsCount: 0, maxPhotosPerPipe: MAX_PHOTOS_PER_PIPE });
  const extraEquipmentPipeList = usePipeList({ defaultJointsCount: 0, maxPhotosPerPipe: MAX_PHOTOS_PER_PIPE });
  const {
    pipes: shiftPipes,
    setPipes: setShiftPipes,
    updatePipe: updateShiftPipe,
    addPipe: addShiftPipe,
    removePipe: removeShiftPipe,
    addPhotos: addShiftPipePhotos,
    removePhoto: removeShiftPipePhoto
  } = shiftPipeList;
  const {
    pipes: pipelinePipes,
    setPipes: setPipelinePipes,
    updatePipe: updatePipelinePipe,
    addPipe: addPipelinePipe,
    removePipe: removePipelinePipe,
    addPhotos: addPipelinePhotos,
    removePhoto: removePipelinePhoto
  } = pipelinePipeList;
  const {
    pipes: equipmentPipes,
    setPipes: setEquipmentPipes,
    updatePipe: updateEquipmentPipe,
    addPipe: addEquipmentPipe,
    removePipe: removeEquipmentPipe,
    addPhotos: addEquipmentPhotos,
    removePhoto: removeEquipmentPhoto
  } = equipmentPipeList;
  const {
    pipes: extraEquipmentPipes,
    setPipes: setExtraEquipmentPipes,
    updatePipe: updateExtraEquipmentPipe,
    addPipe: addExtraEquipmentPipe,
    removePipe: removeExtraEquipmentPipe,
    addPhotos: addExtraEquipmentPhotos,
    removePhoto: removeExtraEquipmentPhoto
  } = extraEquipmentPipeList;
  const [shiftType, setShiftType] = useState<ShiftWorkType>("hours");
  const [shiftValue, setShiftValue] = useState<number>(1);
  const [isolatorWorkDescription, setIsolatorWorkDescription] = useState("");
  const [shiftPhotos, setShiftPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [shiftWorkPipes, setShiftWorkPipes] = useState<string[]>([]);
  const [isShiftExpanded, setIsShiftExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [existingReportForDate, setExistingReportForDate] = useState<Report | null>(null);

  useEffect(() => {
    const uid = profile?.uid;
    if (!uid || !date) {
      setExistingReportForDate(null);
      return;
    }
    return subscribeReportsByUser(
      uid,
      (rows) => {
        setExistingReportForDate(rows.find((r) => r.date === date) ?? null);
      },
      undefined,
      false
    );
  }, [profile?.uid, date]);

  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as Partial<{
        date: string;
        fullName: string;
        shiftPipes: Array<Omit<PipeDraft, "photos"> & { photos?: never }>;
        pipelinePipes: Array<Omit<PipeDraft, "photos"> & { photos?: never }>;
        equipmentPipes: Array<Omit<PipeDraft, "photos"> & { photos?: never }>;
        extraEquipmentPipes: Array<Omit<PipeDraft, "photos"> & { photos?: never }>;
        shiftType: ShiftWorkType;
        shiftValue: number;
        isolatorWorkDescription: string;
        shiftWorkPipes: string[];
      }>;
      if (draft.date) setDate(draft.date);
      if (draft.fullName) setFullName(draft.fullName);
      if (draft.shiftType === "hours" || draft.shiftType === "money") {
        setShiftType(draft.shiftType);
      }
      if (typeof draft.shiftValue === "number") setShiftValue(draft.shiftValue);
      if (draft.isolatorWorkDescription) setIsolatorWorkDescription(draft.isolatorWorkDescription);
      if (Array.isArray(draft.shiftWorkPipes)) setShiftWorkPipes(draft.shiftWorkPipes.filter(Boolean));
      const restoreList = (
        list: Array<Omit<PipeDraft, "photos"> & { photos?: never }> | undefined
      ): PipeDraft[] =>
        Array.isArray(list)
          ? list.map((p) => ({
              localId: p.localId ?? crypto.randomUUID(),
              siteName: p.siteName ?? "",
              diameter: typeof p.diameter === "number" ? p.diameter : 0,
              insulationType: p.insulationType ?? "",
              jointsCount: typeof p.jointsCount === "number" ? p.jointsCount : 1,
              pipeLength: typeof p.pipeLength === "number" ? p.pipeLength : 0,
              comments: p.comments ?? "",
              photos: []
            }))
          : [];
      if (draft.shiftPipes && draft.shiftPipes.length > 0) {
        setShiftPipes(restoreList(draft.shiftPipes));
      }
      if (draft.pipelinePipes && draft.pipelinePipes.length > 0) {
        setPipelinePipes(restoreList(draft.pipelinePipes));
      }
      if (draft.equipmentPipes && draft.equipmentPipes.length > 0) {
        setEquipmentPipes(restoreList(draft.equipmentPipes));
      }
      if (draft.extraEquipmentPipes && draft.extraEquipmentPipes.length > 0) {
        setExtraEquipmentPipes(restoreList(draft.extraEquipmentPipes));
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    const draft = {
      date,
      fullName,
      shiftType,
      shiftValue,
      isolatorWorkDescription,
      shiftWorkPipes,
      shiftPipes: shiftPipes.map(({ photos: _photos, ...rest }) => rest),
      pipelinePipes: pipelinePipes.map(({ photos: _photos, ...rest }) => rest),
      equipmentPipes: equipmentPipes.map(({ photos: _photos, ...rest }) => rest),
      extraEquipmentPipes: extraEquipmentPipes.map(({ photos: _photos, ...rest }) => rest)
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [
    date,
    fullName,
    shiftType,
    shiftValue,
    isolatorWorkDescription,
    shiftWorkPipes,
    shiftPipes,
    pipelinePipes,
    equipmentPipes,
    extraEquipmentPipes
  ]);

  async function handlePipePhotosAdd(
    addFn: (localId: string, files: FileList | null) => Promise<number>,
    localId: string,
    files: FileList | null
  ) {
    const added = await addFn(localId, files);
    if (added > 0) {
      toast.success(`Фото добавлено (${added})`);
    } else if (files?.length) {
      toast.error("Не удалось открыть фото. Попробуйте JPEG или сделайте снимок с камеры.");
    }
  }

  async function addShiftPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = Math.max(0, MAX_PHOTOS_PER_PIPE - shiftPhotos.length);
    const fileArr = Array.from(files).slice(0, room);
    const newItems: { file: File; preview: string }[] = [];
    for (const file of fileArr) {
      try {
        const preview = await makePhotoPreview(file);
        newItems.push({ file, preview });
      } catch {
        /* skip */
      }
    }
    if (!newItems.length) {
      toast.error("Не удалось открыть фото. Попробуйте JPEG или сделайте снимок с камеры.");
      return;
    }
    setShiftPhotos((prev) => [...prev, ...newItems].slice(0, MAX_PHOTOS_PER_PIPE));
    toast.success(`Фото добавлено (${newItems.length})`);
  }

  function removeShiftPhoto(photoIdx: number) {
    setShiftPhotos((prev) => {
      const next = [...prev];
      const removed = next.splice(photoIdx, 1)[0];
      if (removed) revokePhotoPreview(removed.preview);
      return next;
    });
  }

  function addShiftWorkPipeRef() {
    setShiftWorkPipes((prev) => [...prev, ""]);
  }

  function updateShiftWorkPipeRef(index: number, value: string) {
    setShiftWorkPipes((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function removeShiftWorkPipeRef(index: number) {
    setShiftWorkPipes((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    const invalidPhotoCards = collectPhotoCardsWithoutValidData([
      { pipes: shiftPipes, sectionLabel: "Работа за часы", isValid: isValidWorkCard, cardPrefix: "Труба" },
      { pipes: pipelinePipes, sectionLabel: "Теплоизоляция трубопроводов", isValid: isValidWorkCard, cardPrefix: "Труба" },
      { pipes: extraEquipmentPipes, sectionLabel: "Теплоизоляция оборудования", isValid: isValidWorkCard, cardPrefix: "Оборудование" },
      { pipes: equipmentPipes, sectionLabel: "Демонтаж ТИ", isValid: isValidDemountCard, cardPrefix: "Трубопровод" }
    ]);
    if (invalidPhotoCards.length > 0) {
      const first = invalidPhotoCards[0];
      toast.error(
        `Заполните карточку «${first.cardLabel}» (${first.sectionLabel}) — иначе прикреплённые фото не сохранятся.`
      );
      document.getElementById(`card-${first.localId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const validShiftPipes = shiftPipes.filter(isValidWorkCard);
    const validPipelinePipes = pipelinePipes.filter(isValidWorkCard);
    const validEquipment = equipmentPipes.filter(isValidDemountCard);
    const validExtraEquipment = extraEquipmentPipes.filter(isValidWorkCard);
    const hasShiftBlock = shiftValue > 0;

    if (
      !hasShiftBlock &&
      validShiftPipes.length === 0 &&
      validPipelinePipes.length === 0 &&
      validEquipment.length === 0 &&
      validExtraEquipment.length === 0
    ) {
      toast.error("Заполните любой блок: день зачета, фольма-ткань, трубопроводы или оборудование");
      scrollToFirstInvalidField();
      return;
    }
    setSubmitting(true);
    try {
      const reportId = crypto.randomUUID();
      const userId = profile?.uid ?? "demo-isolator";
      const userEmail = profile?.email ?? syntheticEmailForUid(userId);
      const shiftWorkPhotoUrls = await uploadReportPhotos(
        userId,
        `${reportId}/shift-work`,
        shiftPhotos.map((ph) => ph.file),
        shiftPhotos.map((ph) => ph.preview)
      );

      const builtPipes: PipeEntry[] = [];

      for (const p of validShiftPipes) {
        const pipeId = `shift-${p.localId}`;
        const photoUrls = await uploadReportPhotos(
          userId,
          `${reportId}/shift-pipes/${pipeId}`,
          p.photos.map((ph) => ph.file),
          p.photos.map((ph) => ph.preview)
        );
        builtPipes.push({
          id: pipeId,
          siteName: p.siteName.trim(),
          diameter: p.diameter,
          insulationType: p.insulationType,
          jointsCount: p.jointsCount,
          pipeLength: p.pipeLength ?? 0,
          totalLength: pipeTotal(p),
          comments: p.comments,
          photoUrls,
          workKind: "shift_foil" as PipeWorkKind
        });
      }

      for (const p of validPipelinePipes) {
        const pipeId = `pipe-${p.localId}`;
        const photoUrls = await uploadReportPhotos(
          userId,
          `${reportId}/pipes/${pipeId}`,
          p.photos.map((ph) => ph.file),
          p.photos.map((ph) => ph.preview)
        );
        builtPipes.push({
          id: pipeId,
          siteName: p.siteName.trim(),
          diameter: p.diameter,
          insulationType: p.insulationType,
          jointsCount: p.jointsCount,
          pipeLength: p.pipeLength ?? 0,
          totalLength: pipeTotal(p),
          comments: p.comments,
          photoUrls,
          workKind: "pipeline_mount" as PipeWorkKind
        });
      }

      for (const p of validEquipment) {
        const pipeId = `equipment-${p.localId}`;
        const photoUrls = await uploadReportPhotos(
          userId,
          `${reportId}/equipment/${pipeId}`,
          p.photos.map((ph) => ph.file),
          p.photos.map((ph) => ph.preview)
        );
        const normalizedJoints = p.jointsCount > 0 ? p.jointsCount : 1;
        builtPipes.push({
          id: pipeId,
          siteName: p.siteName.trim(),
          diameter: p.diameter,
          insulationType: p.insulationType || "—",
          jointsCount: normalizedJoints,
          pipeLength: p.pipeLength ?? 0,
          totalLength: Number((normalizedJoints * (p.pipeLength ?? 0)).toFixed(2)),
          comments: p.comments,
          photoUrls,
          workKind: "pipeline_demount" as PipeWorkKind
        });
      }

      for (const p of validExtraEquipment) {
        const pipeId = `equipment-extra-${p.localId}`;
        const photoUrls = await uploadReportPhotos(
          userId,
          `${reportId}/equipment-extra/${pipeId}`,
          p.photos.map((ph) => ph.file),
          p.photos.map((ph) => ph.preview)
        );
        builtPipes.push({
          id: pipeId,
          siteName: p.siteName.trim(),
          diameter: p.diameter,
          insulationType: p.insulationType,
          jointsCount: p.jointsCount,
          pipeLength: p.pipeLength ?? 0,
          totalLength: pipeTotal(p),
          comments: p.comments,
          photoUrls,
          workKind: "equipment_mount" as PipeWorkKind
        });
      }

      const payload: Report = {
        id: reportId,
        date,
        fullName,
        brigadeNumber: "",
        airTemperature: 0,
        weather: "",
        comments: isolatorWorkDescription,
        userId,
        userEmail,
        createdAt: Date.now(),
        pipes: builtPipes,
        shiftWork: hasShiftBlock ? { type: shiftType, value: shiftValue } : undefined,
        shiftWorkDescription: isolatorWorkDescription,
        shiftWorkPhotoUrls,
        shiftWorkPipes: shiftWorkPipes.map((s) => s.trim()).filter(Boolean)
      };
      let totalPhotos = shiftWorkPhotoUrls.length;
      for (const pipe of builtPipes) totalPhotos += pipe.photoUrls?.length ?? 0;
      toast.loading("Сохранение отчёта…", { id: "submit-report" });
      await createReport(payload);
      toast.success(totalPhotos > 0 ? `Отчёт сохранён · фото: ${totalPhotos}` : "Отчёт сохранён", { id: "submit-report" });
      setShiftPipes([]);
      setPipelinePipes([]);
      setEquipmentPipes([]);
      setExtraEquipmentPipes([]);
      setShiftType("hours");
      setShiftValue(1);
      setIsolatorWorkDescription("");
      setShiftPhotos([]);
      setShiftWorkPipes([]);
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось сохранить отчёт";
      toast.error(msg, { id: "submit-report" });
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setDate(toTodayInputValue());
    setFullName("");
    setShiftType("hours");
    setShiftValue(1);
    setIsolatorWorkDescription("");
    setShiftWorkPipes([]);
    shiftPhotos.forEach((ph) => revokePhotoPreview(ph.preview));
    shiftPipes.forEach((p) => p.photos.forEach((ph) => revokePhotoPreview(ph.preview)));
    pipelinePipes.forEach((p) => p.photos.forEach((ph) => revokePhotoPreview(ph.preview)));
    equipmentPipes.forEach((p) => p.photos.forEach((ph) => revokePhotoPreview(ph.preview)));
    extraEquipmentPipes.forEach((p) => p.photos.forEach((ph) => revokePhotoPreview(ph.preview)));
    setShiftPipes([]);
    setPipelinePipes([]);
    setEquipmentPipes([]);
    setExtraEquipmentPipes([]);
    setShiftPhotos([]);
    localStorage.removeItem(DRAFT_KEY);
    toast.success("Форма очищена");
  }

  const isValidWorkCardCheck = isValidWorkCard;
  const isValidDemountCardCheck = isValidDemountCard;
  const hasValidShiftPipes = shiftPipes.some(isValidWorkCardCheck);
  const hasValidPipelinePipes = pipelinePipes.some(isValidWorkCardCheck);
  const hasValidEquipment = equipmentPipes.some(isValidDemountCardCheck);
  const hasValidExtraEquipment = extraEquipmentPipes.some(isValidWorkCardCheck);
  const canSubmit =
    shiftValue > 0 ||
    hasValidShiftPipes ||
    hasValidPipelinePipes ||
    hasValidEquipment ||
    hasValidExtraEquipment;
  return (
    <div className="page-stack pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-4">
      <div className="surface-highlight animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Ежедневный отчёт по изоляции</h2>
            <p className="mt-1 text-sm text-slate-100/90">
              Заполните данные на выполненный объем и зафиксируйте смену
            </p>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      <Card className="surface-floating border-slate-300/90 bg-slate-100/85 theme-dark:border-slate-700/90 theme-dark:bg-slate-900/80">
        <CardContent className="space-y-1 p-3 text-sm font-semibold text-slate-800 theme-dark:text-slate-100 sm:text-base">
          <div>ФИО: {profile?.fullName ? formatFullNameForDisplay(profile.fullName) : "не указано"}</div>
          <div className="text-xs font-medium text-slate-600 theme-dark:text-slate-300 sm:text-sm">
            Должность: {profile?.position?.trim() ? profile.position : "не указана"}
          </div>
        </CardContent>
      </Card>

      <StepSection
        icon={<Clock3 className="h-4 w-4" />}
        title="Работа за часы"
      >
        {!isShiftExpanded ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 theme-dark:text-slate-400">
              Разверните и заполните необходимые поля
            </p>
            <Button type="button" variant="secondary" className="w-full" onClick={() => setIsShiftExpanded(true)}>
              Развернуть
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="shift-value">Дата</Label>
            <Input
              id="shift-value"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setShiftValue(1);
              }}
              className={!date ? "border-amber-300 theme-dark:border-amber-700" : ""}
            />
            {existingReportForDate ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 theme-dark:border-amber-700/70 theme-dark:bg-amber-950/40 theme-dark:text-amber-100">
                За выбранную дату отчёт уже отправлен. Можно сдать ещё один — оба будут в истории.
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="isolator-work-description">Описание работы изолировщика</Label>
            <Textarea
              id="isolator-work-description"
              placeholder="Кратко опишите выполненные работы за смену"
              value={isolatorWorkDescription}
              onChange={(e) => setIsolatorWorkDescription(e.target.value)}
            />
          </div>
          <PhotoAttachField
            id="shift-work-photos"
            label="Фото работы изолировщика"
            hint="Фото сохранятся вместе с отчётом за смену."
            maxPhotos={MAX_PHOTOS_PER_PIPE}
            photos={shiftPhotos}
            onAdd={addShiftPhotos}
            onRemove={removeShiftPhoto}
          />
          <div className="surface-floating p-3">
            <div className="mb-2 text-sm font-semibold text-slate-700 theme-dark:text-slate-100">
              Трубы для фиксации смены (фольма-ткань)
            </div>
            {!!shiftPipes.length && (
              <div className="space-y-3">
                {shiftPipes.map((p, idx) => {
                  const photosId = `shift-pipe-${p.localId}-photos`;
                  return (
                    <div
                      key={p.localId}
                      className="surface-floating rounded-2xl p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-100">
                          Труба №{idx + 1}
                          {p.siteName.trim() ? ` · ${p.siteName.trim()}` : ""}
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-10 px-3 sm:h-10"
                          onClick={() => removeShiftPipe(p.localId)}
                          aria-label={`Удалить трубу ${idx + 1}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Удалить
                        </Button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`shift-pipe-${p.localId}-block`}>Блок производства работ</Label>
                          <select
                            id={`shift-pipe-${p.localId}-block`}
                            className={cn(selectClass, !fullName.trim() ? "border-amber-300 theme-dark:border-amber-700" : "")}
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                          >
                            <option value="">Выберите блок…</option>
                            {workBlocks.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`shift-pipe-${p.localId}-site`}>Наименование линии трубопровода</Label>
                          <Input
                            id={`shift-pipe-${p.localId}-site`}
                            placeholder="Наименование линии трубопровода"
                            value={p.siteName}
                            onChange={(e) => updateShiftPipe(p.localId, { siteName: e.target.value })}
                            className={!p.siteName.trim() ? "border-amber-300 theme-dark:border-amber-700" : ""}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`shift-pipe-${p.localId}-insulation`}>Толщина ваты</Label>
                          <select
                            id={`shift-pipe-${p.localId}-insulation`}
                            className={cn(
                              selectClass,
                              !p.insulationType ? "border-amber-300 theme-dark:border-amber-700" : ""
                            )}
                            value={p.insulationType}
                            onChange={(e) => updateShiftPipe(p.localId, { insulationType: e.target.value })}
                          >
                            <option value="">Выбрать толщину...</option>
                            {insulationTypes.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`shift-pipe-${p.localId}-joints`}>Покрывной слой</Label>
                          <Input
                            id={`shift-pipe-${p.localId}-joints`}
                            value="Фольма-ткань"
                            readOnly
                            aria-readonly="true"
                            className="bg-slate-50 theme-dark:bg-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`shift-pipe-${p.localId}-len`}>Выполенный объем, п.м.</Label>
                          <VolumeInput
                            id={`shift-pipe-${p.localId}-len`}
                            value={p.pipeLength}
                            onValueChange={(v) => updateShiftPipe(p.localId, { pipeLength: v })}
                            placeholder="0"
                            unit="п.м."
                            invalid={(p.pipeLength ?? 0) <= 0}
                          />
                        </div>
                      </div>

                      <PhotoAttachField
                        id={photosId}
                        label={`Фотоотчёт ${p.siteName.trim() || "—"}`}
                        maxPhotos={MAX_PHOTOS_PER_PIPE}
                        photos={p.photos}
                        onAdd={(files) => handlePipePhotosAdd(addShiftPipePhotos, p.localId, files)}
                        onRemove={(photoIdx) => removeShiftPipePhoto(p.localId, photoIdx)}
                      />

                      <div className="mt-3 space-y-1">
                        <Label htmlFor={`shift-pipe-${p.localId}-comments`}>Замечания / комментарии</Label>
                        <Textarea
                          id={`shift-pipe-${p.localId}-comments`}
                          placeholder="Замечания / комментарии по трубе"
                          value={p.comments}
                          onChange={(e) => updateShiftPipe(p.localId, { comments: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              className="mt-2 w-full border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 theme-dark:border-slate-600 theme-dark:bg-slate-900 theme-dark:hover:bg-slate-800"
              onClick={addShiftPipe}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Добавить трубу
            </Button>
          </div>
          <Button type="button" variant="secondary" className="w-full" onClick={() => setIsShiftExpanded(false)}>
            Свернуть
          </Button>
          </div>
        )}
      </StepSection>

      <StepSection
        icon={<Wrench className="h-4 w-4" />}
        title="Теплоизоляция трубопроводов"
        subtitle="Добавьте все трубы, заизолированные за смену. У каждой свои параметры, фото и комментарии."
      >
        <div className="space-y-3">
          {!pipelinePipes.length && (
            <p className="text-xs text-slate-500 theme-dark:text-slate-400">
              Нажмите «Добавить трубу», затем заполните все поля карточки.
            </p>
          )}
          {pipelinePipes.map((p, idx) => {
            const photosId = `pipeline-${p.localId}-photos`;
            return (
              <div
                key={p.localId}
                id={`card-${p.localId}`}
                className="surface-floating rounded-2xl p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-100">
                    Труба №{idx + 1}
                    {p.siteName.trim() ? ` · ${p.siteName.trim()}` : ""}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-10 px-3 sm:h-10"
                    onClick={() => removePipelinePipe(p.localId)}
                    aria-label={`Удалить трубу ${idx + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Удалить
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`pipeline-${p.localId}-block`}>Блок производства работ</Label>
                    <select
                      id={`pipeline-${p.localId}-block`}
                      className={cn(selectClass, !fullName.trim() ? "border-amber-300 theme-dark:border-amber-700" : "")}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    >
                      <option value="">Выберите блок…</option>
                      {workBlocks.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pipeline-${p.localId}-site`}>Наименование линии трубопровода</Label>
                    <Input
                      id={`pipeline-${p.localId}-site`}
                      placeholder="Наименование линии трубопровода"
                      value={p.siteName}
                      onChange={(e) => updatePipelinePipe(p.localId, { siteName: e.target.value })}
                      className={!p.siteName.trim() ? "border-amber-300 theme-dark:border-amber-700" : ""}
                    />
                    {!p.siteName.trim() && (
                      <p className="text-xs text-amber-600">Укажите наименование линии трубопровода.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pipeline-${p.localId}-diameter`}>Диаметр трубопровода</Label>
                    <select
                      id={`pipeline-${p.localId}-diameter`}
                      className={cn(selectClass, p.diameter <= 0 ? "border-amber-300 theme-dark:border-amber-700" : "")}
                      value={p.diameter}
                      onChange={(e) => updatePipelinePipe(p.localId, { diameter: Number(e.target.value) })}
                    >
                      <option value={0}>Выбрать диаметр...</option>
                      {diameters.map((d) => (
                        <option key={d} value={d}>
                          {d.toString().replace(".", ",")} мм
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pipeline-${p.localId}-insulation`}>Толщина ваты</Label>
                    <select
                      id={`pipeline-${p.localId}-insulation`}
                      className={cn(
                        selectClass,
                        !p.insulationType ? "border-amber-300 theme-dark:border-amber-700" : ""
                      )}
                      value={p.insulationType}
                      onChange={(e) => updatePipelinePipe(p.localId, { insulationType: e.target.value })}
                    >
                      <option value="">Выбрать толщину...</option>
                      {insulationTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pipeline-${p.localId}-joints`}>Толщина алюминия</Label>
                    <select
                      id={`pipeline-${p.localId}-joints`}
                      className={cn(selectClass, p.jointsCount <= 0 ? "border-amber-300 theme-dark:border-amber-700" : "")}
                      value={p.jointsCount}
                      onChange={(e) => updatePipelinePipe(p.localId, { jointsCount: Number(e.target.value) })}
                    >
                      <option value={0}>Выбрать толщину...</option>
                      {aluminumThicknessOptions.map((t) => (
                        <option key={t} value={t}>
                          {t.toFixed(1).replace(".", ",")} мм
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pipeline-${p.localId}-len`}>Выполенный объем, м2</Label>
                    <VolumeInput
                      id={`pipeline-${p.localId}-len`}
                      value={p.pipeLength}
                      onValueChange={(v) => updatePipelinePipe(p.localId, { pipeLength: v })}
                      placeholder="0"
                      unit="м²"
                      invalid={(p.pipeLength ?? 0) <= 0}
                    />
                    {(p.pipeLength ?? 0) <= 0 && (
                      <p className="text-xs text-amber-600">Объем должен быть больше 0.</p>
                    )}
                  </div>
                </div>

                <PhotoAttachField
                  id={photosId}
                  label={`Фотоотчёт ${p.siteName.trim() || "—"}`}
                  maxPhotos={MAX_PHOTOS_PER_PIPE}
                  photos={p.photos}
                  onAdd={(files) => handlePipePhotosAdd(addPipelinePhotos, p.localId, files)}
                  onRemove={(photoIdx) => removePipelinePhoto(p.localId, photoIdx)}
                />

                <div className="mt-3 space-y-1">
                  <Label htmlFor={`pipeline-${p.localId}-comments`}>Замечания / комментарии</Label>
                  <Textarea
                    id={`pipeline-${p.localId}-comments`}
                    placeholder="Замечания / комментарии по трубе"
                    value={p.comments}
                    onChange={(e) => updatePipelinePipe(p.localId, { comments: e.target.value })}
                  />
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="secondary"
            className="w-full border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 theme-dark:border-slate-600 theme-dark:bg-slate-900 theme-dark:hover:bg-slate-800"
            onClick={addPipelinePipe}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Добавить трубу
          </Button>
        </div>
      </StepSection>

      <StepSection
        icon={<Wrench className="h-4 w-4" />}
        title="Теплоизоляция оборудования"
        subtitle="Добавьте все оборудование, заизолированное за смену. У каждого оборудования свои параметры, фото и коментарии."
      >
        <div className="space-y-3">
          {!extraEquipmentPipes.length && (
            <p className="text-xs text-slate-500 theme-dark:text-slate-400">
              Нажмите «Добавить оборудование», затем заполните все поля карточки.
            </p>
          )}
          {extraEquipmentPipes.map((p, idx) => {
            const photosId = `extra-equipment-${p.localId}-photos`;
            return (
              <div
                key={p.localId}
                className="surface-floating rounded-2xl p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-100">
                    Оборудование №{idx + 1}
                    {p.siteName.trim() ? ` · ${p.siteName.trim()}` : ""}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-10 px-3 sm:h-10"
                    onClick={() => removeExtraEquipmentPipe(p.localId)}
                    aria-label={`Удалить оборудование ${idx + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Удалить
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`extra-equipment-${p.localId}-date`}>Дата</Label>
                    <Input
                      id={`extra-equipment-${p.localId}-date`}
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`extra-equipment-${p.localId}-block`}>Блок производства работ</Label>
                    <select
                      id={`extra-equipment-${p.localId}-block`}
                      className={cn(selectClass, !fullName.trim() ? "border-amber-300 theme-dark:border-amber-700" : "")}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    >
                      <option value="">Выберите блок…</option>
                      {workBlocks.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`extra-equipment-${p.localId}-site`}>Наименование оборудования</Label>
                    <Input
                      id={`extra-equipment-${p.localId}-site`}
                      placeholder="Наименование оборудования"
                      value={p.siteName}
                      onChange={(e) => updateExtraEquipmentPipe(p.localId, { siteName: e.target.value })}
                      className={!p.siteName.trim() ? "border-amber-300 theme-dark:border-amber-700" : ""}
                    />
                    {!p.siteName.trim() && (
                      <p className="text-xs text-amber-600">Укажите наименование оборудования.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`extra-equipment-${p.localId}-insulation`}>Толщина ваты</Label>
                    <select
                      id={`extra-equipment-${p.localId}-insulation`}
                      className={cn(
                        selectClass,
                        !p.insulationType ? "border-amber-300 theme-dark:border-amber-700" : ""
                      )}
                      value={p.insulationType}
                      onChange={(e) => updateExtraEquipmentPipe(p.localId, { insulationType: e.target.value })}
                    >
                      <option value="">Выбрать толщину...</option>
                      {insulationTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`extra-equipment-${p.localId}-joints`}>Толщина алюминия</Label>
                    <select
                      id={`extra-equipment-${p.localId}-joints`}
                      className={cn(selectClass, p.jointsCount <= 0 ? "border-amber-300 theme-dark:border-amber-700" : "")}
                      value={p.jointsCount}
                      onChange={(e) => updateExtraEquipmentPipe(p.localId, { jointsCount: Number(e.target.value) })}
                    >
                      <option value={0}>Выбрать толщину...</option>
                      {aluminumThicknessOptions.map((t) => (
                        <option key={t} value={t}>
                          {t.toFixed(1).replace(".", ",")} мм
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`extra-equipment-${p.localId}-len`}>Выполенный объем, м2</Label>
                    <VolumeInput
                      id={`extra-equipment-${p.localId}-len`}
                      value={p.pipeLength}
                      onValueChange={(v) => updateExtraEquipmentPipe(p.localId, { pipeLength: v })}
                      placeholder="0"
                      unit="м²"
                      invalid={(p.pipeLength ?? 0) <= 0}
                    />
                    {(p.pipeLength ?? 0) <= 0 && (
                      <p className="text-xs text-amber-600">Объем должен быть больше 0.</p>
                    )}
                  </div>
                </div>

                <PhotoAttachField
                  id={photosId}
                  label={`Фотоотчёт ${p.siteName.trim() || "—"}`}
                  maxPhotos={MAX_PHOTOS_PER_PIPE}
                  photos={p.photos}
                  onAdd={(files) => handlePipePhotosAdd(addExtraEquipmentPhotos, p.localId, files)}
                  onRemove={(photoIdx) => removeExtraEquipmentPhoto(p.localId, photoIdx)}
                />

                <div className="mt-3 space-y-1">
                  <Label htmlFor={`extra-equipment-${p.localId}-comments`}>Замечания / комментарии</Label>
                  <Textarea
                    id={`extra-equipment-${p.localId}-comments`}
                    placeholder="Замечания / комментарии по оборудованию"
                    value={p.comments}
                    onChange={(e) => updateExtraEquipmentPipe(p.localId, { comments: e.target.value })}
                  />
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="secondary"
            className="w-full border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 theme-dark:border-slate-600 theme-dark:bg-slate-900 theme-dark:hover:bg-slate-800"
            onClick={addExtraEquipmentPipe}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Добавить оборудование
          </Button>
        </div>
      </StepSection>

      <div>
        <StepSection
          icon={<Wrench className="h-4 w-4" />}
          title="Демонтаж ТИ на трубопроводах"
        >
          <div className="space-y-3">
          {!equipmentPipes.length && (
            <p className="text-xs text-slate-500 theme-dark:text-slate-400">
              Нажмите «Добавить трубопровод», затем заполните карточку.
            </p>
          )}
          {equipmentPipes.map((p, idx) => {
            const photosId = `equipment-${p.localId}-photos`;
            return (
              <div
                key={p.localId}
                className="surface-floating rounded-2xl p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-100">
                    Трубопровод №{idx + 1}
                    {p.siteName.trim() ? ` · ${p.siteName.trim()}` : ""}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-10 px-3 sm:h-10"
                    onClick={() => removeEquipmentPipe(p.localId)}
                    aria-label={`Удалить трубопровод ${idx + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Удалить
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`equipment-${p.localId}-date`}>Дата</Label>
                    <Input
                      id={`equipment-${p.localId}-date`}
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`equipment-${p.localId}-block`}>Блок производства работ</Label>
                    <select
                      id={`equipment-${p.localId}-block`}
                      className={cn(selectClass, !fullName.trim() ? "border-amber-300 theme-dark:border-amber-700" : "")}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    >
                      <option value="">Выберите блок…</option>
                      {workBlocks.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`equipment-${p.localId}-site`}>Наименование трубопровода</Label>
                    <Input
                      id={`equipment-${p.localId}-site`}
                      placeholder="Наименование трубопровода"
                      value={p.siteName}
                      onChange={(e) => updateEquipmentPipe(p.localId, { siteName: e.target.value })}
                      className={!p.siteName.trim() ? "border-amber-300 theme-dark:border-amber-700" : ""}
                    />
                    {!p.siteName.trim() && (
                      <p className="text-xs text-amber-600">Укажите наименование трубопровода.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`equipment-${p.localId}-diameter`}>Диаметр трубопровода</Label>
                    <select
                      id={`equipment-${p.localId}-diameter`}
                      className={cn(selectClass, p.diameter <= 0 ? "border-amber-300 theme-dark:border-amber-700" : "")}
                      value={p.diameter}
                      onChange={(e) => updateEquipmentPipe(p.localId, { diameter: Number(e.target.value) })}
                    >
                      <option value={0}>Выбрать диаметр...</option>
                      {diameters.map((d) => (
                        <option key={d} value={d}>
                          {d.toString().replace(".", ",")} мм
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`equipment-${p.localId}-len`}>Выполенный объем, м2</Label>
                    <VolumeInput
                      id={`equipment-${p.localId}-len`}
                      value={p.pipeLength}
                      onValueChange={(v) => updateEquipmentPipe(p.localId, { pipeLength: v })}
                      placeholder="0"
                      unit="м²"
                      invalid={(p.pipeLength ?? 0) <= 0}
                    />
                    {(p.pipeLength ?? 0) <= 0 && (
                      <p className="text-xs text-amber-600">Объем должен быть больше 0.</p>
                    )}
                  </div>
                </div>

                <PhotoAttachField
                  id={photosId}
                  label={`Фотоотчёт ${p.siteName.trim() || "—"}`}
                  maxPhotos={MAX_PHOTOS_PER_PIPE}
                  photos={p.photos}
                  onAdd={(files) => handlePipePhotosAdd(addEquipmentPhotos, p.localId, files)}
                  onRemove={(photoIdx) => removeEquipmentPhoto(p.localId, photoIdx)}
                />

                <div className="mt-3 space-y-1">
                  <Label htmlFor={`equipment-${p.localId}-comments`}>Замечания / комментарии</Label>
                  <Textarea
                    id={`equipment-${p.localId}-comments`}
                    placeholder="Замечания / комментарии по оборудованию"
                    value={p.comments}
                    onChange={(e) => updateEquipmentPipe(p.localId, { comments: e.target.value })}
                  />
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="secondary"
            className="w-full border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 theme-dark:border-slate-600 theme-dark:bg-slate-900 theme-dark:hover:bg-slate-800"
            onClick={addEquipmentPipe}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Добавить трубопровод
          </Button>
          </div>
        </StepSection>
      </div>

      <div className="mt-6 space-y-2 border-t border-slate-200/80 pt-4 theme-dark:border-slate-700/80">
        {!canSubmit && (
          <p className="text-xs text-amber-600 theme-dark:text-amber-400">
            Для отправки достаточно заполнить любой блок: день зачета, фольма-ткань, трубопроводы или
            оборудование.
          </p>
        )}
        <div className="flex justify-stretch sm:justify-end">
          <Button
            type="button"
            variant="accent"
            className="w-full shadow-sm sm:w-auto sm:min-w-[12rem]"
            disabled={submitting || !canSubmit}
            onClick={() => void submit()}
          >
            {submitting ? "Сохранение..." : "Отправить отчёт"}
          </Button>
        </div>
      </div>
    </div>
  );
}
