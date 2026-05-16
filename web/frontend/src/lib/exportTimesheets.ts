import type { InsulatorTimesheet } from "./timesheetCalc";
import { formatRub } from "./timesheetCalc";

export async function exportTimesheetsExcel(
  sheets: InsulatorTimesheet[],
  periodLabel: string
) {
  const XLSX = await import("xlsx");
  const summaryRows = sheets.map((s) => ({
    Изолировщик: s.fullName,
    Должность: s.position ?? "",
    "Смен, шт": s.quantities.shiftDays,
    "Сумма смена (₽)": s.quantities.shiftMoneySum,
    "ТИ труб, м²": s.quantities.pipelineMountM2,
    "ТИ оборуд., м²": s.quantities.equipmentMountM2,
    "Демонтаж, м²": s.quantities.demountM2,
    "Фольга, п.м.": s.quantities.foilPm,
    "Начислено, ₽": s.amounts.total
  }));

  const detailRows = sheets.flatMap((s) =>
    s.lines.map((line) => ({
      Изолировщик: s.fullName,
      Дата: line.reportDate,
      Описание: line.description,
      Количество: line.quantity,
      Ед: line.unit,
      "Ставка, ₽": line.rate,
      "Сумма, ₽": line.amount
    }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Сводка");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Детализация");
  const meta = XLSX.utils.aoa_to_sheet([["Период", periodLabel], ["Всего, ₽", formatRub(sheets.reduce((s, r) => s + r.amounts.total, 0))]]);
  XLSX.utils.book_append_sheet(wb, meta, "Инфо");
  XLSX.writeFile(wb, `pto-timesheets-${periodLabel.replace(/[^\d-]/g, "_")}.xlsx`);
}
