import type { PipeEntry, Report } from "../types";

interface FlatRow {
  Дата: string;
  Блок: string;
  "Температура, °C": number;
  Погода: string;
  "№ трубы": number;
  "Линия трубопровода": string;
  "Диаметр, мм": number | string;
  "Тип изоляции": string;
  "Стыков, шт": number;
  "Длина одной трубы, м": number;
  "Протяженность, м": number;
  Комментарий: string;
}

function flattenReports(items: Report[]): FlatRow[] {
  const out: FlatRow[] = [];
  for (const r of items) {
    const pipes: PipeEntry[] = r.pipes ?? [];
    pipes.forEach((p, idx) => {
      out.push({
        Дата: r.date,
        Блок: r.fullName ?? "",
        "Температура, °C": r.airTemperature,
        Погода: r.weather,
        "№ трубы": idx + 1,
        "Линия трубопровода": p.siteName ?? "",
        "Диаметр, мм": p.diameter ?? "",
        "Тип изоляции": p.insulationType ?? "",
        "Стыков, шт": p.jointsCount ?? 0,
        "Длина одной трубы, м": p.pipeLength ?? 0,
        "Протяженность, м": p.totalLength ?? 0,
        Комментарий: p.comments ?? ""
      });
    });
  }
  return out;
}

export async function exportExcel(items: Report[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(flattenReports(items));
  XLSX.utils.book_append_sheet(wb, ws, "Отчеты");
  XLSX.writeFile(wb, "pto-reports.xlsx");
}

export async function exportPdf(items: Report[]) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable")
  ]);
  const doc = new jsPDF("landscape");
  autoTable(doc, {
    head: [[
      "Дата",
      "Блок",
      "№ трубы",
      "Линия",
      "Ø, мм",
      "Тип изоляции",
      "Стыки",
      "Длина, м"
    ]],
    body: flattenReports(items).map((r) => [
      r["Дата"],
      r["Блок"],
      String(r["№ трубы"]),
      r["Линия трубопровода"],
      String(r["Диаметр, мм"]),
      r["Тип изоляции"],
      String(r["Стыков, шт"]),
      String(r["Протяженность, м"])
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 58, 95] }
  });
  doc.save("pto-reports.pdf");
}
