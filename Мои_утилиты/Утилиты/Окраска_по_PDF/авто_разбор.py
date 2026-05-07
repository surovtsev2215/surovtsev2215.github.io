# -*- coding: utf-8 -*-
"""
Эвристический разбор PDF: выбор стратегии (спецификация / геометрия / запасной лист),
оценка площади окраски по страницам. Без облачного API.

Улучшения: штамп «Формат: A0–A4» (латиница/кириллическая А), площадь по ISO 216;
пары мм с экстремальным соотношением сторон (профили вроде 410×36) не считаются габаритом листа;
геометрия выбирает пару, ближайшую по пропорции к странице PDF.
"""

from __future__ import annotations

import copy
import math
import os
import re
from dataclasses import dataclass, field, replace
from typing import Any, Callable

ProgressCb = Callable[[int, str], None]

# Якоря спецификации / ведомостей (нижний регистр)
_SPEC_WORDS = (
    "спецификация",
    "specification",
    "ведомость",
    "ведомость деталей",
    "ведомость покупных",
    "позиция",
    "поз.",
    "обозначение",
    "наименование",
    "марка",
    "кол-во",
    "количество",
    "масса",
    "площадь",
    "лист",
    "statement",
    "assembly",
)

# Штамп: «Формат: A1» / «Format: A1» / кириллическая А
_RE_FORMAT_STAMP = re.compile(
    r"(?i)(?:формат|format)\s*[:\s\uFF1A]?\s*(?:A|\u0410)\s*([01234])\b",
)

# ISO 216: короткая × длинная сторона, мм (портрет)
_ISO_MM: dict[str, tuple[float, float]] = {
    "A0": (841.0, 1189.0),
    "A1": (594.0, 841.0),
    "A2": (420.0, 594.0),
    "A3": (297.0, 420.0),
    "A4": (210.0, 297.0),
}

# Паттерны явной площади, м²
_RE_AREA_M2 = re.compile(
    r"(?:площадь|s\s*=|s,|площ\.?)\s*[:\s]*(\d{1,4}(?:[.,]\d+)?)\s*(?:м\s*2|м²|м\^2|m2)\b",
    re.IGNORECASE,
)
_RE_AREA_ANY = re.compile(
    r"(\d{1,4}(?:[.,]\d+)?)\s*(?:м\s*2|м²|м\^2|m2)\b",
    re.IGNORECASE,
)

# Габариты: 1200 x 800 мм или 1200×800
_RE_DIM_PAIR_MM = re.compile(
    r"(\d{2,6})\s*[x×хX]\s*(\d{2,6})\s*(?:мм|mm)?",
    re.IGNORECASE,
)

# Запасной путь: типовые форматы (имя, ширина/высота мм, допуск)
_SHEET_PRESETS: list[tuple[str, float, float, float]] = [
    ("A4", 210.0, 297.0, 0.04),
    ("A4_альбом", 297.0, 210.0, 0.04),
    ("A3", 297.0, 420.0, 0.04),
    ("A3_альбом", 420.0, 297.0, 0.04),
    ("A2", 420.0, 594.0, 0.05),
    ("A2_альбом", 594.0, 420.0, 0.05),
    ("A1", 594.0, 841.0, 0.06),
    ("A1_альбом", 841.0, 594.0, 0.06),
    ("A0", 841.0, 1189.0, 0.07),
    ("A0_альбом", 1189.0, 841.0, 0.07),
]

# Пары вида 410×36 — сечение проката; не использовать как «лист»
_MAX_PROFILE_ASPECT = 5.5

# Поля исключения по умолчанию (доля от 0 до 1)
_DEFAULT_MARGIN_L = 0.02
_DEFAULT_MARGIN_R = 0.02
_DEFAULT_MARGIN_T = 0.0
_DEFAULT_MARGIN_B = 0.08


def _noop_progress(_p: int, _m: str) -> None:
    pass


def _maybe_enrich_profiles_llm(
    util_dir: str | None,
    rows: list[Any],
    catalog_m2: dict[str, float],
    catalog_kg: dict[str, float] | None,
    *,
    validation_tolerance_pct: float,
) -> None:
    ud = str(util_dir or "").strip()
    if not ud or not rows or not catalog_m2:
        return
    try:
        from классификация_профилей_llm import classify_unknown_profiles_with_llm
        from ведомость_металл import (
            apply_profile_llm_hints_to_rows,
            profile_raw_canonical_key,
            reconcile_catalog_with_bom,
        )
    except ImportError:
        return
    cand: list[str] = []
    seen: set[str] = set()
    for rr in rows:
        if rr.catalog_m2_per_m is not None:
            continue
        ck = profile_raw_canonical_key(str(rr.profile_raw or ""))
        if len(ck) < 3 or ck in seen:
            continue
        seen.add(ck)
        cand.append(ck)
    if not cand:
        return
    hmap = classify_unknown_profiles_with_llm(ud, cand)
    if not hmap:
        return
    n = apply_profile_llm_hints_to_rows(rows, hmap, catalog_m2, catalog_kg)
    if n > 0:
        reconcile_catalog_with_bom(rows, tolerance_pct=validation_tolerance_pct, abs_kg_tol=0.05)


def _norm_num(s: str) -> float:
    return float(s.replace(",", ".").replace(" ", ""))


def _page_text(doc: "fitz.Document", page_index: int) -> str:
    page = doc[page_index]
    return page.get_text("text") or ""


def _iso_format_name_from_text(text: str) -> str | None:
    m = _RE_FORMAT_STAMP.search(text or "")
    if not m:
        return None
    return "A" + m.group(1)


def _document_iso_format(pages_text: list[str]) -> str | None:
    for t in pages_text:
        v = _iso_format_name_from_text(t)
        if v:
            return v
    return None


def _apply_default_margins_m2(gross_m2: float) -> float:
    usable_w = 1.0 - _DEFAULT_MARGIN_L - _DEFAULT_MARGIN_R
    usable_h = 1.0 - _DEFAULT_MARGIN_T - _DEFAULT_MARGIN_B
    return gross_m2 * max(0.1, usable_w) * max(0.1, usable_h)


def _area_from_iso_stamp(iso: str, rect: "fitz.Rect") -> tuple[float, str]:
    """Площадь по имени формата из штампа и ориентации страницы PDF (ISO 216)."""
    key = iso.upper()
    if key not in _ISO_MM:
        return _fallback_area_m2_for_page(rect)
    short_mm, long_mm = _ISO_MM[key]
    ar_pdf = (rect.width / rect.height) if rect.height > 1e-6 else 1.0
    if ar_pdf >= 1.0:
        w_mm, h_mm = long_mm, short_mm
        orient = "альбом"
    else:
        w_mm, h_mm = short_mm, long_mm
        orient = "портрет"
    gross_m2 = (w_mm / 1000.0) * (h_mm / 1000.0)
    area = _apply_default_margins_m2(gross_m2)
    detail = f"Штамп {iso} ISO ({w_mm:.0f}×{h_mm:.0f} мм, {orient}), минус поля по умолчанию"
    return area, detail


def _pair_aspect_ratio(a: float, b: float) -> float:
    lo, hi = (min(a, b), max(a, b))
    return hi / (lo + 1e-9)


def _sheet_like_pairs(pairs: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [p for p in pairs if _pair_aspect_ratio(p[0], p[1]) <= _MAX_PROFILE_ASPECT]


def _page_aspect_normalized(rect: "fitz.Rect") -> float:
    """Соотношение длинной стороны к короткой (>= 1), как у пары мм."""
    if rect.height < 1e-6:
        return 1.0
    ar = rect.width / rect.height
    return max(ar, 1.0 / (ar + 1e-9))


def _best_geom_pair_mm(pairs: list[tuple[float, float]], rect: "fitz.Rect") -> tuple[float, float] | None:
    """
    Пара мм, похожая на габарит поля чертежа: не узкий профиль,
    пропорция ближе всего к странице PDF (логарифмическая метрика).
    """
    candidates = _sheet_like_pairs(pairs)
    if not candidates:
        return None
    target = _page_aspect_normalized(rect)

    def score(ab: tuple[float, float]) -> tuple[float, float]:
        a, b = ab
        r = _pair_aspect_ratio(a, b)
        dist = abs(math.log(r + 1e-9) - math.log(target + 1e-9))
        area = a * b
        return (dist, -area)

    best = min(candidates, key=score)
    return best


def _spec_keyword_score(text: str) -> int:
    t = text.lower()
    return sum(1 for w in _SPEC_WORDS if w in t)


def _extract_explicit_areas_m2(text: str) -> list[float]:
    found: list[float] = []
    for m in _RE_AREA_M2.finditer(text):
        try:
            found.append(_norm_num(m.group(1)))
        except ValueError:
            continue
    if not found:
        for m in _RE_AREA_ANY.finditer(text):
            try:
                v = _norm_num(m.group(1))
                if 0.0001 <= v <= 5000.0:
                    found.append(v)
            except ValueError:
                continue
    return found


def _extract_dim_pairs_mm(text: str) -> list[tuple[float, float]]:
    pairs: list[tuple[float, float]] = []
    for m in _RE_DIM_PAIR_MM.finditer(text):
        try:
            a = float(m.group(1))
            b = float(m.group(2))
            if 5 <= a <= 50000 and 5 <= b <= 50000:
                pairs.append((a, b))
        except ValueError:
            continue
    return pairs


def _score_geometry_text(text: str) -> float:
    """Скоринг только по «листоподобным» парам, без сечений проката."""
    pairs = _sheet_like_pairs(_extract_dim_pairs_mm(text))
    if not pairs:
        return 0.0
    areas = [a * b for a, b in pairs]
    max_a = max(areas) if areas else 0.0
    return math.log10(1 + max_a) * 2 + min(len(pairs), 8) * 0.3


def _score_spec_text(text: str) -> float:
    kw = _spec_keyword_score(text)
    areas = _extract_explicit_areas_m2(text)
    area_bonus = sum(math.log10(1 + a) for a in areas if a > 0) if areas else 0.0
    return kw * 1.2 + area_bonus * 2


def _fallback_area_m2_for_page(rect: "fitz.Rect") -> tuple[float, str]:
    """Площадь листа по совпадению mediabox с форматом A-серии + поля по умолчанию."""
    w_pt = float(rect.width)
    h_pt = float(rect.height)
    if w_pt < 1 or h_pt < 1:
        return 0.0, "Пустой mediabox"
    ar = w_pt / h_pt if h_pt else 1.0
    best: tuple[str, float, float, float] | None = None
    best_err = 1e9
    for name, mm_w, mm_h, tol in _SHEET_PRESETS:
        exp = mm_w / mm_h
        err = abs(math.log((ar + 1e-9) / (exp + 1e-9)))
        if best is None or err < best_err - 1e-9:
            best_err = err
            best = (name, mm_w, mm_h, tol)
    if best is None or best_err > 0.25 + (best[3] if best else 0.0):
        mm_w, mm_h = 210.0, 297.0
        name = "неизвестный_формат→A4"
    else:
        name, mm_w, mm_h, _tol = best
    gross_m2 = (mm_w / 1000.0) * (mm_h / 1000.0)
    area = _apply_default_margins_m2(gross_m2)
    return area, f"Лист как {name} ({mm_w:.0f}×{mm_h:.0f} мм), минус поля по умолчанию"


def _choose_strategy(
    pages_text: list[str],
) -> tuple[str, str, str]:
    """
    Возвращает (strategy, confidence, reason).
    strategy: spec | geometry | fallback
    """
    doc_iso = _document_iso_format(pages_text)
    if doc_iso:
        return (
            "fallback",
            "высокая",
            f"В тексте найден формат листа {doc_iso} (штамп) — площадь по ISO 216 и полям по умолчанию, без пар из спецификации проката.",
        )

    total_spec = 0.0
    total_geom = 0.0
    area_hits = 0
    for t in pages_text:
        total_spec += _score_spec_text(t)
        total_geom += _score_geometry_text(t)
        area_hits += len(_extract_explicit_areas_m2(t))
    has_text = any(len((x or "").strip()) > 30 for x in pages_text)

    if (total_spec >= 3.0 or (area_hits >= 1 and total_spec >= 0.5)) and total_spec >= total_geom * 0.85:
        conf = "высокая" if total_spec >= 6 or area_hits >= 3 else "средняя"
        return (
            "spec",
            conf,
            f"Признаки спецификации/явные площади (скоринг {total_spec:.1f}, явных м²: {area_hits}; геометрия {total_geom:.1f}).",
        )
    if total_geom >= 2.5 and total_geom > total_spec:
        conf = "высокая" if total_geom >= 5 else "средняя"
        return (
            "geometry",
            conf,
            f"В тексте найдены размерные цепочки мм (скоринг геометрии {total_geom:.1f} vs спецификация {total_spec:.1f}).",
        )
    if has_text:
        return (
            "fallback",
            "низкая",
            "Недостаточно признаков спецификации и размерных рядов — используется оценка по формату листа.",
        )
    return (
        "fallback",
        "низкая",
        "Почти нет извлекаемого текста (возможен скан без слоя) — оценка только по формату листа.",
    )


@dataclass
class PageResult:
    page_index: int
    area_m2: float
    detail: str


@dataclass
class AnalyzeResult:
    strategy: str
    confidence: str
    reason: str
    per_page: list[PageResult] = field(default_factory=list)
    metal_lines: list[dict[str, Any]] = field(default_factory=list)
    metal_validation: list[dict[str, Any]] = field(default_factory=list)
    quality_metrics: dict[str, Any] = field(default_factory=dict)
    explicit_paint_area_m2: float | None = None
    explicit_paint_area_ambiguous: bool = False
    # Шапка отчёта: title, code, organization, source (metadata|regex|filename)
    report_header: dict[str, str] = field(default_factory=dict)
    # Марка сборки → число отправочных комплектов из «Ведомости отправочных элементов»
    shipment_qty_by_mark: dict[str, int] = field(default_factory=dict)
    # Диагностика склеенных КМД (граница BOM, LLM, сравнение с явной площадью)
    merged_diagnostics: dict[str, Any] = field(default_factory=dict)

    @property
    def total_m2(self) -> float:
        return sum(p.area_m2 for p in self.per_page)


def _clean_meta_line(s: str | None) -> str:
    if s is None:
        return ""
    t = str(s).strip()
    if len(t) < 2 or len(t) > 280:
        return ""
    if re.fullmatch(r"[\d\s\-\.]+", t):
        return ""
    # Отсев мусора вроде «_2», «12» из метаданных PDF
    if len(t) <= 5 and not re.search(r"[А-Яа-яЁёA-Za-z]{2,}", t):
        return ""
    low = t.lower()
    if low in ("untitled", "microsoft word", "document1"):
        return ""
    return t


def build_report_header(
    doc: "fitz.Document",
    pages_text: list[str],
    source_path: str | None,
) -> dict[str, str]:
    """Извлечь подписи для Excel/CSV: объект, шифр, организация; source — откуда взято название."""
    stem = ""
    if source_path:
        stem = os.path.splitext(os.path.basename(source_path))[0].strip() or "чертеж"
    out: dict[str, str] = {"title": "", "code": "", "organization": "", "source": "filename"}
    sample = ""
    for i in range(min(2, len(pages_text))):
        sample += (pages_text[i] or "") + "\n"
    sample = sample[:12000]

    meta: dict[str, Any] = {}
    try:
        meta = dict(doc.metadata or {})
    except Exception:
        meta = {}
    title_m = _clean_meta_line(meta.get("title"))
    subj = _clean_meta_line(meta.get("subject"))
    if title_m and (not stem or title_m.lower() != stem.lower()):
        out["title"] = title_m
        out["source"] = "metadata"
    elif subj and (not stem or subj.lower() != stem.lower()):
        out["title"] = subj
        out["source"] = "metadata"

    def _pick(pat: re.Pattern, text: str, group: int = 1) -> str:
        m = pat.search(text)
        if not m:
            return ""
        s = (m.group(group) or "").strip()
        s = re.sub(r"\s+", " ", s)
        return s[:200] if s else ""

    title_rx = _pick(
        re.compile(
            r"(?is)(?:Объект\s+строительства|Наименование\s+объекта)\s*[:\u2014\-\.\s]+\s*([^\n]{8,200})"
        ),
        sample,
    )
    if not title_rx:
        title_rx = _pick(
            re.compile(
                r"(?is)(?:^|[\n\r])\s*Объект\s*[:\u2014\-\.\s]+\s*([А-Яа-яЁёA-Za-z0-9][^\n]{6,180})"
            ),
            sample,
        )
    if not title_rx:
        title_rx = _pick(
            re.compile(r"(?is)(?:Object|Project\s+name)\s*[:\.\s]+\s*([A-Za-z0-9][^\n]{6,160})"),
            sample,
        )
    if not title_rx:
        title_rx = _pick(re.compile(r"(?is)Наименование\s*[:\.\s]+\s*([А-Яа-яЁёA-Za-z0-9][^\n]{6,160})"), sample)

    code = _pick(
        re.compile(
            r"(?is)(?:Шифр\s+(?:чертежа\s+)?|Обозначение)\s*[:\.\s]+\s*([^\n]{3,100})"
        ),
        sample,
    )
    if not code:
        code = _pick(
            re.compile(r"(?is)(?:Drawing\s+no\.?|Doc\.?\s*No\.?)\s*[:\.\s]+\s*([^\n]{3,100})"),
            sample,
        )

    org = _pick(
        re.compile(r"(?is)(?:Организация|Изготовитель)\s*[:\.\s]+\s*([^\n]{6,160})"),
        sample,
    )
    bad_org = re.compile(
        r"(?i)^(проверил|утвердил|разработал|согласовано|инв\.?\s*№|дата)\b",
    )
    if org and bad_org.search(org.strip()):
        org = ""

    if not out["title"] and title_rx:
        out["title"] = title_rx
        out["source"] = "regex"
    if not out["title"]:
        out["title"] = stem
        out["source"] = "filename"
    if code:
        out["code"] = code
    if org:
        out["organization"] = org

    # Слишком короткое / бессмысленное имя → имя файла
    tit = (out["title"] or "").strip()
    if (
        len(tit) < 4
        or (not re.search(r"[А-Яа-яЁёA-Za-z]", tit))
        or bool(re.fullmatch(r"[\d_\s\-.]+", tit))
    ):
        out["title"] = stem
        out["source"] = "filename"
    return out


def with_report_header(
    res: AnalyzeResult,
    doc: "fitz.Document",
    pages_text: list[str],
    source_path: str | None,
) -> AnalyzeResult:
    h = build_report_header(doc, pages_text, source_path)
    return replace(res, report_header=h)


def _spec_page_index(pages_text: list[str]) -> int:
    from ведомость_металл import extract_spec_block

    for i, t in enumerate(pages_text):
        if extract_spec_block(t):
            return i
    return 0


def _normalize_asm_mark_quick(s: str | None) -> str:
    return str(s or "").strip().replace("_", "-")


def _row_check_status(
    validation: list[dict[str, Any]],
    position: str,
    assembly_mark: str | None = None,
) -> str:
    w = "ok"
    pos = str(position).strip()
    row_mk = _normalize_asm_mark_quick(assembly_mark)
    for v in validation:
        if str(v.get("position", "")).strip() != pos:
            continue
        vm = str(v.get("assembly_mark") or "").strip()
        if vm and _normalize_asm_mark_quick(vm) != row_mk:
            continue
        s = v.get("severity")
        if s == "error":
            return "issue"
        if s == "warning":
            w = "warn"
    return w


def _analyze_metal_mode(
    pages_text: list[str],
    prog: ProgressCb,
    catalog_path: str | None,
    basename_hint: str | None = None,
    validation_tolerance_pct: float = 2.0,
    *,
    metal_options: dict[str, Any] | None = None,
    doc: Any | None = None,
) -> AnalyzeResult:
    try:
        from merged_llm_pipeline import (
            explicit_paint_vs_total_conflict,
            read_merged_config,
            run_merged_llm_repair,
        )
    except ImportError:

        def run_merged_llm_repair(*_a: Any, **_k: Any) -> tuple[Any, Any, dict[str, Any]]:  # type: ignore[no-redef]
            return None, {}, {"llm_error": "merged_llm_pipeline недоступен"}

        def read_merged_config(_d: str) -> dict[str, Any]:  # type: ignore[no-redef]
            return {}

        def explicit_paint_vs_total_conflict(*_a: Any, **_k: Any) -> bool:  # type: ignore[no-redef]
            return False

    opts = metal_options or {}
    util_dir = str(opts.get("util_dir") or "").strip()
    ui_merged = bool(opts.get("merged_llm_ui"))
    ui_vision = bool(opts.get("allow_vision_ui"))

    from ведомость_металл import (
        _RE_SPEC_ANCHOR,
        apply_catalog,
        apply_profile_llm_hints_to_rows,
        build_quality_metrics,
        diagnose_global_spec_tail_open,
        build_segmented_bom_joint_text,
        dedupe_spec_rows,
        extract_explicit_paint_area_m2,
        extract_shipment_qty_by_mark,
        extract_shipment_qty_for_bom_pages,
        extract_spec_rows,
        spec_rows_from_llm_json_rows,
        spec_rows_from_layout_pages,
        lint_catalog,
        load_catalog_tables,
        angle_profile_dims_mm,
        plate_profile_dims_mm,
        profile_raw_canonical_key,
        profile_section_display_str,
        reconcile_catalog_with_bom,
        rolled_section_profile_label,
        shipment_qty_for_assembly_mark,
        validate_metal_rows,
    )

    prog(24, "Разбор ведомости (учёт объединённых PDF)…")
    full = "\n".join(pages_text)
    n_pages = len(pages_text or [])
    segmented_text, bom_pages = build_segmented_bom_joint_text(pages_text)
    anchor_pages_ct = sum(1 for t in pages_text if _RE_SPEC_ANCHOR.search(t or ""))
    rows_legacy = extract_spec_rows(full, basename_hint)
    rows_seg: list[Any] = []
    if segmented_text.strip():
        rows_seg = extract_spec_rows(segmented_text, basename_hint, presegmented_joint=True)

    bom_source = "global_first_anchor"
    merged_multi = n_pages >= 4
    if merged_multi and rows_seg:
        rows = rows_seg
        bom_source = "segmented_by_page"
    else:
        rows = rows_legacy

    spatial_diag: dict[str, Any] = {}
    spatial_rows: list[Any] = []
    if doc is not None and bom_pages:
        prog(26, "Ведомость по координатам текста (layout)…")
        spatial_rows, spatial_diag = spec_rows_from_layout_pages(doc, bom_pages, basename_hint)
    flat_row_count_after_seg = len(rows)
    layout_hints = {
        "avg_spatial_confidence": float(spatial_diag.get("avg_confidence") or 0.0),
        "spatial_row_count": int(spatial_diag.get("rows_total") or 0),
        "flat_row_count": int(flat_row_count_after_seg),
        "bom_pages_sample": bom_pages[:20],
        "need_vision_boost": bool(
            bom_pages
            and (
                spatial_diag.get("rows_total") in (0, None)
                or float(spatial_diag.get("avg_confidence") or 0.0) < 0.42
                or int(spatial_diag.get("rows_total") or 0) < max(6, flat_row_count_after_seg // 3)
            )
        ),
    }

    prog(27, "Каталог профилей и сверка flat vs spatial…")
    cat_m2, cat_kg = load_catalog_tables(catalog_path)
    lint_msgs = lint_catalog(catalog_path)
    expl_val, expl_found = extract_explicit_paint_area_m2(full)

    bom_arbitration: dict[str, Any] = {}
    if spatial_rows:
        sp_n = len(spatial_rows)
        avg_c = float(spatial_diag.get("avg_confidence") or 0.0)
        low_ct = sum(
            1 for r in spatial_rows if float(getattr(r, "layout_confidence", 0.0) or 0.0) < 0.42
        )
        old_prefer_spatial = bool(
            (
                sp_n >= max(6, int(flat_row_count_after_seg * 0.42))
                and avg_c >= 0.38
                and low_ct <= max(2, int(sp_n * 0.45))
            )
            or (sp_n >= flat_row_count_after_seg * 0.9 and avg_c >= 0.33 and sp_n >= 5)
        )

        def _dry_validation_error_warn_counts(src_rows: list[Any]) -> tuple[int, int]:
            if not src_rows:
                return (10**9, 10**9)
            rr = dedupe_spec_rows(copy.deepcopy(src_rows))
            if not rr:
                return (10**9, 10**9)
            rr2, _, _ = apply_catalog(rr, cat_m2, cat_kg or None)
            reconcile_catalog_with_bom(
                rr2,
                tolerance_pct=validation_tolerance_pct,
                abs_kg_tol=0.05,
            )
            val_tmp = validate_metal_rows(
                rr2,
                tolerance_pct=validation_tolerance_pct,
                explicit_paint_m2=expl_val,
                explicit_candidates=expl_found if expl_found else None,
                catalog_m2_lookup=cat_m2,
            )
            e_ct = sum(1 for v in val_tmp if str(v.get("severity")) == "error")
            w_ct = sum(1 for v in val_tmp if str(v.get("severity")) == "warning")
            return (e_ct, w_ct)

        if not rows:
            rows = spatial_rows
            bom_source = "spatial_layout"
            es0, ws0 = _dry_validation_error_warn_counts(rows)
            bom_arbitration = {
                "chosen": bom_source,
                "reason": "flat_rows_empty",
                "flat_validation": None,
                "spatial_validation": {"errors": es0, "warnings": ws0},
                "spatial_row_count": sp_n,
                "flat_row_count": flat_row_count_after_seg,
                "old_prefer_spatial_heuristic": old_prefer_spatial,
            }
        else:
            ef, wf = _dry_validation_error_warn_counts(rows)
            es, ws = _dry_validation_error_warn_counts(spatial_rows)
            tie = (ef, wf) == (es, ws)
            keep_flat = (ef, wf) < (es, ws) or (tie and not old_prefer_spatial)
            bom_arbitration = {
                "chosen": bom_source if keep_flat else "spatial_layout",
                "reason": (
                    "validation_arbitration_flat"
                    if keep_flat and not tie
                    else (
                        "validation_arbitration_spatial"
                        if not keep_flat and not tie
                        else (
                            "validation_tie_kept_flat"
                            if keep_flat and tie
                            else "validation_tie_picked_spatial"
                        )
                    )
                ),
                "flat_validation": {"errors": ef, "warnings": wf},
                "spatial_validation": {"errors": es, "warnings": ws},
                "spatial_row_count": sp_n,
                "flat_row_count": flat_row_count_after_seg,
                "old_prefer_spatial_heuristic": old_prefer_spatial,
            }
            if not keep_flat:
                rows = spatial_rows
                bom_source = "spatial_layout"
    mc = read_merged_config(util_dir) if util_dir else {}
    min_pages_llm = int(mc.get("merged_llm_min_pages") or 6)
    tail_open, tail_len = diagnose_global_spec_tail_open(full)

    preliminary_area = 0.0
    cand = rows_seg if rows_seg else rows_legacy
    for r in cand:
        preliminary_area += float(getattr(r, "area_m2", 0) or 0)

    paint_conflict_pre = explicit_paint_vs_total_conflict(expl_val, float(preliminary_area)) if preliminary_area > 50 else False

    conf_score = 1.0
    if tail_open:
        conf_score -= 0.35
    if paint_conflict_pre:
        conf_score -= 0.4
    if n_pages >= min_pages_llm and len(rows_seg or []) > max(180, anchor_pages_ct * 55):
        conf_score -= 0.18
    conf_score = max(0.0, min(1.0, float(conf_score)))

    trigger_heuristic = bool(tail_open or paint_conflict_pre or conf_score < 0.58)
    merged_llm_auto = bool(mc.get("merged_llm_auto", True))
    run_llm = False
    if util_dir:
        # Принудительно (меню «Ещё») — как раньше включённая кнопка на панели.
        if ui_merged and n_pages >= 4:
            run_llm = True
        # Фоновый режим: большие PDF + неуверенность или merged_llm_default в конфиге.
        elif (
            merged_llm_auto
            and n_pages >= min_pages_llm
            and (trigger_heuristic or bool(mc.get("merged_llm_default")))
        ):
            run_llm = True

    llm_meta: dict[str, Any] = {}
    shipment_qty_by_mark: dict[str, int] = {}
    if bom_pages:
        shipment_qty_by_mark = extract_shipment_qty_for_bom_pages(pages_text, bom_pages)
    else:
        shipment_qty_by_mark = extract_shipment_qty_by_mark(full)

    if rows and run_llm:

        def _prog_wrap(pct: int, msg: str) -> None:
            prog(40 + int(pct * 0.15), msg)

        bom_llm, ship_llm, llm_meta = run_merged_llm_repair(
            util_dir,
            pages_text,
            progress=_prog_wrap,
            basename_hint=basename_hint,
            merged_confidence=conf_score,
            validation_issue_count=0,
            doc=doc,
            allow_vision=bool(ui_vision or bool(mc.get("allow_vision_default"))),
            layout_hints=layout_hints,
        )
        err_llm = (llm_meta or {}).get("llm_error") or ""
        jmat = (llm_meta or {}).get("bom_material_rows")
        if isinstance(jmat, list) and len(jmat) >= max(5, len(rows) // 6):
            rows_llmj = spec_rows_from_llm_json_rows(jmat, basename_hint)
            if len(rows_llmj) >= max(5, len(rows) // 6):
                rows = rows_llmj
                bom_source = "llm_material_json"
        if bom_llm and len(bom_llm.strip()) > 80 and bom_source != "llm_material_json":
            rows_llm = extract_spec_rows(bom_llm, basename_hint, presegmented_joint=True)
            if len(rows_llm) >= max(5, len(rows) // 5):
                rows = rows_llm
                bom_source = "llm_repair"
        if ship_llm:
            shipment_qty_by_mark.update({str(k): int(v) for k, v in ship_llm.items()})
        if err_llm and not bom_llm:
            prog(55, "LLM без текста BOM — локальная эвристика")

    rows = dedupe_spec_rows(rows)
    pi = _spec_page_index(pages_text)
    if not rows:
        diag = {
            "n_pages": n_pages,
            "bom_source": bom_source,
            "tail_open_ended": tail_open,
            "tail_chars": tail_len,
            "merged_confidence": conf_score,
            "anchor_pages": anchor_pages_ct,
            "spatial_layout_diag": spatial_diag,
            "layout_hints": layout_hints,
            "bom_arbitration": bom_arbitration,
        }
        msg = "Не найден блок «Спецификация деталей / Specification» или не удалось разобрать строки."
        return AnalyzeResult(
            "metal_catalog",
            "низкая",
            msg,
            [PageResult(pi, 0.0, msg)],
            metal_lines=[],
            metal_validation=lint_msgs,
            merged_diagnostics=diag,
        )
    prof_aliases: dict[str, str] = {}
    try:
        from арбитр_ключа_каталога import load_profile_aliases_sidecars
        from ведомость_металл import apply_profile_aliases_to_rows

        pj_opt = str(opts.get("project_json_path") or "").strip()
        if util_dir:
            prof_aliases.update(load_profile_aliases_sidecars(pj_opt if pj_opt else None, util_dir))
        extra_pa = opts.get("profile_aliases")
        if isinstance(extra_pa, dict):
                for kk, vv in extra_pa.items():
                    if isinstance(kk, str) and isinstance(vv, str):
                        from ведомость_металл import profile_raw_canonical_key as _prk_pa

                        prof_aliases.setdefault(_prk_pa(kk), vv.strip())
        if prof_aliases:
            prog(31, "Алиасы профилей проекта…")
            apply_profile_aliases_to_rows(rows, prof_aliases, cat_m2, cat_kg)
    except ImportError:
        pass
    rows, matched, _n_prof = apply_catalog(rows, cat_m2, cat_kg or None)
    reconcile_catalog_with_bom(
        rows,
        tolerance_pct=validation_tolerance_pct,
        abs_kg_tol=0.05,
    )
    _maybe_enrich_profiles_llm(
        util_dir,
        rows,
        cat_m2,
        cat_kg,
        validation_tolerance_pct=validation_tolerance_pct,
    )
    ambiguous = expl_val is None and len(expl_found) > 1
    val_body = validate_metal_rows(
        rows,
        tolerance_pct=validation_tolerance_pct,
        explicit_paint_m2=expl_val,
        explicit_candidates=expl_found if expl_found else None,
        catalog_m2_lookup=cat_m2,
    )

    diag_merged: dict[str, Any] = {
        "n_pages": n_pages,
        "bom_source": bom_source,
        "tail_open_ended": tail_open,
        "tail_chars": tail_len,
        "merged_confidence": conf_score,
        "anchor_pages": anchor_pages_ct,
        "bom_block_pages_sample": bom_pages[:30],
        "llm_attempted": bool(run_llm),
        "llm_meta": llm_meta,
        "spatial_layout_diag": spatial_diag,
        "layout_hints": layout_hints,
        "bom_arbitration": bom_arbitration,
    }

    severity_run = sum(1 for v in val_body if str(v.get("severity")) in ("warning", "error"))
    bom_llm2: str | None = None
    ship_llm2: dict[str, int] = {}
    if run_llm and rows and severity_run > 10 and util_dir:

        def _prog2(pp: int, mm: str) -> None:
            prog(72 + int(pp * 0.12), mm)

        bom_llm2, ship_llm2, vm = run_merged_llm_repair(
            util_dir,
            pages_text,
            progress=_prog2,
            basename_hint=basename_hint,
            merged_confidence=conf_score,
            validation_issue_count=int(severity_run),
            doc=doc,
            allow_vision=bool(ui_vision or bool(mc.get("allow_vision_default"))),
            layout_hints=layout_hints,
        )
        llm_meta["second_pass"] = vm
        jmat2 = (vm or {}).get("bom_material_rows")
        if isinstance(jmat2, list) and len(jmat2) >= max(8, len(rows) // 5):
            rows2j = spec_rows_from_llm_json_rows(jmat2, basename_hint)
            if len(rows2j) >= max(8, len(rows) // 5):
                rows = dedupe_spec_rows(rows2j)
                if prof_aliases:
                    try:
                        from ведомость_металл import apply_profile_aliases_to_rows as _apl_rows

                        _apl_rows(rows, prof_aliases, cat_m2, cat_kg)
                    except ImportError:
                        pass
                rows, matched, _n_prof = apply_catalog(rows, cat_m2, cat_kg or None)
                reconcile_catalog_with_bom(
                    rows,
                    tolerance_pct=validation_tolerance_pct,
                    abs_kg_tol=0.05,
                )
                _maybe_enrich_profiles_llm(
                    util_dir,
                    rows,
                    cat_m2,
                    cat_kg,
                    validation_tolerance_pct=validation_tolerance_pct,
                )
                val_body = validate_metal_rows(
                    rows,
                    tolerance_pct=validation_tolerance_pct,
                    explicit_paint_m2=expl_val,
                    explicit_candidates=expl_found if expl_found else None,
                    catalog_m2_lookup=cat_m2,
                )
                bom_source = "llm_material_json"
        elif bom_llm2 and len(bom_llm2.strip()) > 80:
            rows2 = extract_spec_rows(bom_llm2, basename_hint, presegmented_joint=True)
            if len(rows2) >= max(10, len(rows) // 3):
                rows = dedupe_spec_rows(rows2)
                if prof_aliases:
                    try:
                        from ведомость_металл import apply_profile_aliases_to_rows as _apl_rows

                        _apl_rows(rows, prof_aliases, cat_m2, cat_kg)
                    except ImportError:
                        pass
                rows, matched, _n_prof = apply_catalog(rows, cat_m2, cat_kg or None)
                reconcile_catalog_with_bom(
                    rows,
                    tolerance_pct=validation_tolerance_pct,
                    abs_kg_tol=0.05,
                )
                _maybe_enrich_profiles_llm(
                    util_dir,
                    rows,
                    cat_m2,
                    cat_kg,
                    validation_tolerance_pct=validation_tolerance_pct,
                )
                val_body = validate_metal_rows(
                    rows,
                    tolerance_pct=validation_tolerance_pct,
                    explicit_paint_m2=expl_val,
                    explicit_candidates=expl_found if expl_found else None,
                    catalog_m2_lookup=cat_m2,
                )
                diag_merged["bom_source"] = "llm_repair_retry"
        if isinstance(ship_llm2, dict) and ship_llm2:
            shipment_qty_by_mark.update({str(k): int(v) for k, v in ship_llm2.items()})
        diag_merged["llm_meta"] = llm_meta

    try:
        from ассистент_llm import прочитать_конфиг as _acf_hub
        from арбитр_ключа_каталога import run_catalog_key_disambiguation
    except ImportError:
        _acf_hub = None
        run_catalog_key_disambiguation = None  # type: ignore[misc, assignment]

    hub_cfg: dict[str, Any] = {}
    if _acf_hub is not None and util_dir.strip():
        try:
            hub_cfg = dict(_acf_hub(util_dir))
        except Exception:
            hub_cfg = {}
    hub_cfg.setdefault("catalog_key_mass_fit_resolve", True)
    hub_cfg.setdefault("catalog_key_disambiguate_llm", False)

    if run_catalog_key_disambiguation is not None:
        prog(92, "Сверка ключей профиля с каталогом (кг/м)…")
        val_body = run_catalog_key_disambiguation(
            rows,
            val_body,
            catalog_m2=cat_m2,
            catalog_kg=cat_kg or {},
            reconcile_fn=reconcile_catalog_with_bom,
            validate_fn=validate_metal_rows,
            lint_prefix=list(lint_msgs),
            validation_tolerance_pct=validation_tolerance_pct,
            expl_val=expl_val,
            expl_found=list(expl_found) if expl_found else None,
            util_dir=str(util_dir or ""),
            acfg=hub_cfg,
            diag_accum=diag_merged,
        )

    total_area_one = sum(float(r.area_m2) for r in rows if r.catalog_m2_per_m is not None)

    paint_order_bad = explicit_paint_vs_total_conflict(expl_val, total_area_one)
    diag_merged["explicit_paint_order_mismatch"] = paint_order_bad
    if paint_order_bad:
        val_body = list(val_body)
        if not any(str(v.get("code")) == "explicit_paint_orders_magnitude" for v in val_body):
            val_body.insert(
                0,
                {
                    "severity": "warning",
                    "code": "explicit_paint_orders_magnitude",
                    "message": (
                        "Суммарная площадь по ведомости намного выше явной площади в тексте PDF — возможна ошибка границы BOM (типично для «все листы»)."
                    ),
                },
            )

    forbid_clean = paint_order_bad or (tail_open and n_pages >= min_pages_llm and conf_score < 0.48)
    diag_merged["forbid_clean_success"] = forbid_clean
    if forbid_clean:
        val_body = list(val_body)
        if not any(str(v.get("code")) == "merged_pdf_uncertain_block" for v in val_body):
            val_body.insert(
                min(1, len(val_body)),
                {
                    "severity": "warning",
                    "code": "merged_pdf_uncertain_block",
                    "message": (
                        "Объединённый PDF: возможна неверная граница ведомости — не считайте расчёт безошибочным без контроля инженером."
                    ),
                },
            )

    full_val = list(lint_msgs) + list(val_body)
    qm = build_quality_metrics(full_val, rows)
    n_need = sum(1 for r in rows if (r.profile_key or (r.profile_raw and r.profile_raw.strip())))
    if not cat_m2:
        reason = (
            "Каталог пуст или файл CSV не найден — положите «профили_м2_на_пм.csv» рядом с утилитой или выберите файл."
        )
        conf = "низкая"
    elif matched == 0:
        reason = (
            f"В каталоге нет ключей для распознанных профилей ({len(rows)} строк ведомости). Дополните CSV."
        )
        conf = "низкая"
    elif n_need and matched >= n_need:
        reason = "Площадь окраски по ведомости (м²/п.м × длина × кол-во). Площадь листа PDF не используется."
        conf = "высокая"
    else:
        reason = f"Частично: в каталоге {matched} из {n_need} позиций с профилем; без ключа — строка с м²=0."
        conf = "средняя"
    if shipment_qty_by_mark:
        ship_txt = "; ".join(f"{mk} — {n} шт." for mk, n in sorted(shipment_qty_by_mark.items()))
        reason = f"{reason} Учтено отправочных элементов (комплектов): {ship_txt}."
    if tail_open and n_pages >= min_pages_llm:
        reason += (
            " В объединённом PDF граница BOM по всему файлу может быть недоступна — использован разбор по страницам"
            + (" и запрос LLM" if diag_merged.get("llm_attempted") else "")
            + "."
        )
        if conf == "высокая":
            conf = "средняя"
    reason = f"Источник BOM: {bom_source}; стр.: {n_pages}; уверенность merged≈{conf_score:.2f}. " + reason
    per_page: list[PageResult] = []
    metal_lines: list[dict[str, Any]] = []
    for r in rows:
        mk_norm = r.assembly_mark.strip()
        k_ship = shipment_qty_for_assembly_mark(mk_norm, shipment_qty_by_mark)
        p_dims = plate_profile_dims_mm(r.profile_raw, r.length_mm, r.mass_kg_total, r.qty)
        element_kind = ""
        if p_dims:
            element_kind = "лист"
        else:
            ad = angle_profile_dims_mm(
                r.profile_raw,
                r.length_mm,
                r.mass_kg_total,
                r.qty,
            )
            if ad:
                p_dims = ad
                element_kind = "уголок"
            else:
                rd, rk = rolled_section_profile_label(r.profile_raw, r.length_mm)
                if rd:
                    p_dims = rd
                    element_kind = rk
        area_base = float(r.area_m2)
        k_ship = max(1, int(k_ship))
        area_out = area_base * k_ship
        mass_u_out = float(r.mass_kg_unit) * k_ship if r.mass_kg_unit is not None else None
        mass_t_out = float(r.mass_kg_total) * k_ship if r.mass_kg_total is not None else None
        det = f"[{r.assembly_mark}] поз.{r.position} {r.profile_key or r.profile_raw[:32]} L={r.length_mm:.0f}×{r.qty}"
        if k_ship > 1:
            det += f" ×{k_ship} отпр."
        if r.catalog_m2_per_m is not None:
            det += f" × {r.catalog_m2_per_m:.4f} м²/м → {area_out:.4f} м² (на 1 компл. {area_base:.4f} м²)"
        else:
            det += " — нет ключа в CSV"
        if mass_t_out is not None:
            det += f"; м={mass_t_out:.2f} кг"
        per_page.append(PageResult(pi, max(0.0, area_out), det))
        area_implied = None
        delta_area = None
        kgpm_bom = None
        dlen = (r.length_mm / 1000.0) * r.qty
        if r.mass_kg_total is not None and r.catalog_kg_per_m and r.catalog_kg_per_m > 1e-9 and r.catalog_m2_per_m is not None:
            area_implied_one = float(r.mass_kg_total) * (float(r.catalog_m2_per_m) / float(r.catalog_kg_per_m))
            area_implied = area_implied_one * k_ship
            delta_area = area_implied - area_out
        if r.mass_kg_total is not None and dlen > 1e-9:
            kgpm_bom = float(r.mass_kg_total) / dlen
        st = _row_check_status(full_val, r.position, r.assembly_mark)
        q_pc = max(1, int(r.qty))
        area_per_piece = float(area_base) / float(q_pc)
        p_sec = profile_section_display_str(r.profile_raw)
        metal_lines.append(
            {
                "assembly_mark": r.assembly_mark,
                "position": r.position,
                "qty": r.qty,
                "length_mm": r.length_mm,
                "profile_raw": r.profile_raw,
                "profile_key": r.profile_key,
                "profile_section_display": p_sec or "",
                "profile_dims_mm": p_dims,
                "element_kind": element_kind,
                "steel": r.steel,
                "note": r.note,
                "m2_per_m": r.catalog_m2_per_m,
                "kg_per_m": r.catalog_kg_per_m,
                "area_m2": area_out,
                "area_m2_one_assembly": area_base,
                "area_m2_per_piece": area_per_piece,
                "mass_kg_unit": mass_u_out,
                "mass_kg_total": mass_t_out,
                "shipment_qty": k_ship,
                "area_implied_m2": area_implied,
                "delta_area_m2": delta_area,
                "kgpm_from_bom": kgpm_bom,
                "row_status": st,
                "row_source": getattr(r, "row_source", "flat") or "flat",
                "layout_confidence": getattr(r, "layout_confidence", None),
            }
        )
    prog(100, "Готово")
    return AnalyzeResult(
        "metal_catalog",
        conf,
        reason,
        per_page,
        metal_lines,
        metal_validation=full_val,
        quality_metrics=qm,
        explicit_paint_area_m2=expl_val,
        explicit_paint_area_ambiguous=ambiguous,
        shipment_qty_by_mark=dict(shipment_qty_by_mark),
        merged_diagnostics=dict(diag_merged),
    )


def analyze_pdf_document(
    doc: "fitz.Document",
    progress: ProgressCb | None = None,
    *,
    goal: str = "sheet",
    catalog_path: str | None = None,
    source_path: str | None = None,
    validation_tolerance_pct: float = 2.0,
    metal_options: dict[str, Any] | None = None,
) -> AnalyzeResult:
    """goal: 'sheet' — лист/текст; 'metal' — металл по ведомости и CSV м²/п.м."""
    prog = progress or _noop_progress
    n = len(doc)
    if n == 0:
        return with_report_header(
            AnalyzeResult("fallback", "низкая", "Документ без страниц", [], []),
            doc,
            [],
            source_path,
        )

    prog(5, "Извлечение текста со страниц…")
    pages_text: list[str] = []
    for i in range(n):
        pages_text.append(_page_text(doc, i))
        if n > 1:
            p = 5 + int(25 * (i + 1) / n)
            prog(p, f"Страница {i + 1}/{n}: текст")

    if goal == "metal":
        hint = source_path or getattr(doc, "name", None) or ""
        raw = _analyze_metal_mode(
            pages_text,
            prog,
            catalog_path,
            basename_hint=hint or None,
            validation_tolerance_pct=validation_tolerance_pct,
            metal_options=metal_options,
            doc=doc,
        )
        return with_report_header(raw, doc, pages_text, hint or source_path)

    prog(35, "Оценка: спецификация или геометрия…")
    strategy, confidence, reason = _choose_strategy(pages_text)
    doc_iso = _document_iso_format(pages_text)

    per_page: list[PageResult] = []
    prog(45, f"Режим: {strategy}")

    if strategy == "spec":
        for i in range(n):
            t = pages_text[i]
            rect = doc[i].rect
            areas = _extract_explicit_areas_m2(t)
            if areas:
                s = sum(areas)
                detail = f"Сумма явных площадей в тексте ({len(areas)} вхождений)"
                if s > 1e6:
                    s = max(areas)
                    detail = "Взята максимальная площадь (подозрительно большая сумма)"
            else:
                pairs = _extract_dim_pairs_mm(t)
                best = _best_geom_pair_mm(pairs, rect)
                if best:
                    a_mm, b_mm = best
                    s = a_mm * b_mm / 1e6
                    detail = f"Пара по тексту {a_mm:.0f}×{b_mm:.0f} мм (без узких сечений), ближе к пропорции листа"
                elif doc_iso:
                    s, detail = _area_from_iso_stamp(doc_iso, rect)
                else:
                    s, detail = _fallback_area_m2_for_page(rect)
                    detail = f"Нет подходящих пар мм: {detail}"
            per_page.append(PageResult(i, max(0.0, float(s)), detail))
            prog(45 + int(50 * (i + 1) / n), f"Лист {i + 1}: расчёт")

    elif strategy == "geometry":
        for i in range(n):
            t = pages_text[i]
            rect = doc[i].rect
            pairs = _extract_dim_pairs_mm(t)
            best = _best_geom_pair_mm(pairs, rect)
            if best:
                a_mm, b_mm = best
                s = a_mm * b_mm / 1e6
                detail = f"Габарит по тексту {a_mm:.0f}×{b_mm:.0f} мм (профильные пары отброшены, угол к странице PDF)"
            elif doc_iso:
                s, detail = _area_from_iso_stamp(doc_iso, rect)
            else:
                s, detail = _fallback_area_m2_for_page(rect)
                detail = f"Нет пар мм как у листа: {detail}"
            per_page.append(PageResult(i, max(0.0, float(s)), detail))
            prog(45 + int(50 * (i + 1) / n), f"Лист {i + 1}: геометрия")

    else:
        for i in range(n):
            rect = doc[i].rect
            if doc_iso:
                s, why = _area_from_iso_stamp(doc_iso, rect)
            else:
                s, why = _fallback_area_m2_for_page(rect)
            per_page.append(PageResult(i, max(0.0, float(s)), why))
            prog(45 + int(50 * (i + 1) / n), f"Лист {i + 1}: формат листа")

    prog(100, "Готово")
    return with_report_header(
        AnalyzeResult(strategy=strategy, confidence=confidence, reason=reason, per_page=per_page, metal_lines=[]),
        doc,
        pages_text,
        source_path,
    )
