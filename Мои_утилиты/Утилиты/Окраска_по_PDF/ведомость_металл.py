# -*- coding: utf-8 -*-
"""
Разбор блока «Спецификация деталей / Specification» из текста PDF
и сопоставление с CSV «м² окраски на погонный метр» по ключу сечения.
"""

from __future__ import annotations

import csv
import math
import os
import re
from collections.abc import Iterable, Sequence
from difflib import SequenceMatcher
from dataclasses import dataclass
from typing import Any

# Якорь начала таблицы спецификации деталей (ГОСТ-«Спецификация деталей», Tekla: отдельная строка «Спецификация»)
_RE_SPEC_ANCHOR = re.compile(
    r"(?im)(?:"
    r"Спецификация\s+деталей\s*/\s*Specification|"
    r"Спецификация\s+деталей|"
    r"Спецификация\s+элементов|"
    r"Ведомость\s+деталей|"
    r"^\s*Specification\s*$|"
    r"^\s*Спецификация\s*$|"
    r"\bSpecification\s+of\s+(?:parts|details|materials)\b|"
    r"\bBill\s+of\s+materials\b"
    r")",
)

# Конец блока (до геометрии чертежа / служебных подписей)
_RE_SPEC_END = re.compile(
    r"Масса\s+напл\.\s*металла|Weight\s+weld\s+metal",
    re.IGNORECASE,
)

_RE_STEEL = re.compile(
    r"^[CС]\d{3}(?:-\d+)?$|^S\d{3,4}$|^[CSС]\d{2,3}[A-Z]?$",
    re.IGNORECASE,
)

# Допускается *, / и дефис между размерами (чертежи / OCR).
_RE_WXH_IN_PROFILE = re.compile(
    r"(\d{1,5})\s*(?:[x×х*]|\s*/\s*|\s*[-–—]\s*)\s*(\d{1,3})",
    re.IGNORECASE,
)

# Опорные точки для оценки м²/п.м листа, если в CSV нет строки (как при генерации профили_база.csv).
_PLATE_M2_REF_POINTS: tuple[tuple[int, int, float], ...] = (
    (194, 10, 1.10),
    (410, 36, 1.75),
    (314, 16, 1.05),
    (384, 16, 1.12),
    (324, 16, 1.00),
    (344, 16, 1.08),
    (200, 12, 1.08),
    (250, 16, 1.04),
    (280, 16, 1.03),
    (300, 20, 1.02),
    (360, 20, 1.06),
    (400, 25, 1.15),
)

_STEEL_KG_PER_M3 = 7850.0


def _plate_kg_per_m(w_mm: int, t_mm: int) -> float:
    """Масса погонного метра полосы B×t, мм (сталь ~7850 кг/м³)."""
    return round(_STEEL_KG_PER_M3 * w_mm * t_mm * 1e-6, 4)


def _estimate_plate_m2_per_m(w_mm: int, t_mm: int) -> float:
    """Оценка м²/м по ближайшей опорной строке (линейно по B+t)."""
    best: tuple[int, float, int, int] | None = None
    for w0, t0, m0 in _PLATE_M2_REF_POINTS:
        d = abs(w_mm - w0) + abs(t_mm - t0)
        if best is None or d < best[0]:
            best = (d, m0, w0, t0)
    assert best is not None
    _, m0, w0, t0 = best
    den = w0 + t0
    if den <= 0:
        return round(m0, 4)
    return round(m0 * (w_mm + t_mm) / den, 4)


def _plate_wxh_plausible(w_mm: int, t_mm: int) -> bool:
    if w_mm < 4 or t_mm < 3:
        return False
    if w_mm > 1200 or t_mm > 200:
        return False
    return w_mm + t_mm >= 18


def _pick_plate_wxh_for_fallback(
    wxh_list: list[str],
    mass_kg_total: float | None,
    length_mm: float,
    qty: int,
) -> tuple[int, int] | None:
    """Выбор пары B×t для запасного расчёта; при массе — по ближайшему кг/м."""
    pairs: list[tuple[int, int]] = []
    for wxh in wxh_list:
        parts = wxh.lower().replace("х", "x").split("x")
        if len(parts) != 2:
            continue
        try:
            w, t = int(parts[0]), int(parts[1])
        except ValueError:
            continue
        if not _plate_wxh_plausible(w, t):
            continue
        pairs.append((w, t))
    if not pairs:
        return None
    dlen = (length_mm / 1000.0) * max(1, qty)
    if mass_kg_total is not None and dlen > 1e-9:
        kg_obs = mass_kg_total / dlen
        best_err: float | None = None
        best_pair: tuple[int, int] = pairs[0]
        for w, t in pairs:
            ke = _plate_kg_per_m(w, t)
            if ke < 1e-9:
                continue
            ref = max(abs(kg_obs), abs(ke), 1.0)
            err = abs(ke - kg_obs) / ref
            if best_err is None or err < best_err:
                best_err = err
                best_pair = (w, t)
        return best_pair
    return pairs[0]



def _unify_profile_chars(s: str) -> str:
    """
    Латиница в обозначениях проката (K→к, B→б …) как на чертежах / в OCR.
    Не трогаем 'x' в 410x36 — отдельно обрабатывается регистронезависимым шаблоном.
    """
    if not s:
        return ""
    s = (
        str(s)
        .replace("\u00a0", " ")
        .replace("\u2007", " ")
        .replace("\u2009", " ")
        .replace("\u202f", " ")
        .replace("\u200b", "")
        .replace("\ufeff", "")
    )
    trans = str.maketrans(
        {
            "K": "к",
            "k": "к",
            "B": "б",
            "b": "б",
            "M": "м",
            "m": "м",
            "P": "п",
            "p": "п",
            "C": "с",
            "c": "с",
            "Y": "у",
            "y": "у",
            "T": "т",
            "t": "т",
        }
    )
    u = str(s).translate(trans)
    # Полноширинные цифры из PDF
    return u.translate(str.maketrans("０１２３４５６７８９", "0123456789"))


def _clean_profile_cell(s: str) -> str:
    t = str(s).strip()
    t = re.sub(r"\s+", " ", t)
    t = t.rstrip(",").strip()
    # Две группы целых через запятую (напр. 194,10 как ширина×толщина) — не как 1,234
    t = re.sub(r"(\d{2,5})\s*,\s*(\d{1,3})(?![0-9])", r"\1x\2", t)
    # Частый мусор в извлечённой ячейке PDF: тире, служебные слова
    t = re.sub(r"^[—–\-‒\s]+", "", t)
    t = re.sub(
        r"^(?:лист|пластина|пл\.?|полоса|металл)\s*[№#]?\s*",
        "",
        t,
        flags=re.IGNORECASE,
    )
    # OCR: лат. «l» вместо «1» после размерного знака (200xl2 → 200x12)
    t = re.sub(r"([x×х])\s*[lL]\s*(\d)", r"\g<1>1\2", t, flags=re.I)
    return t.strip()


def _all_wxh_keys_from_text(s: str) -> list[str]:
    """Все пары B×t в ячейке профиля (порядок слева направо), без дублей."""
    if not s:
        return []
    t = _unify_profile_chars(s).strip()
    out: list[str] = []
    seen: set[str] = set()
    for m in _RE_WXH_IN_PROFILE.finditer(t):
        key = f"{int(m.group(1))}x{int(m.group(2))}"
        kl = key.lower()
        if kl not in seen:
            seen.add(kl)
            out.append(key)
    return out


def _gost_slug_tokens(slug: str) -> list[str]:
    """Фрагменты вроде 40к2, 35ш1, 30п внутри длинного slug ячейки."""
    if not slug or len(slug) < 4:
        return []
    s = slug.lower()
    toks: list[str] = []
    pats = (
        r"\d{2,4}[бкшщ]\d{1,4}",
        r"\d{2,3}ш\d{1,3}",
        r"\d{2,3}б\d{1,3}",
        r"\d{2,3}щ\d{1,3}",
        r"\d{2,3}п\d{0,2}(?=[^а-яё0-9]|$)",
        r"(?<![а-яё0-9])\d{2,3}п(?=[^а-яё0-9]|$)",
    )
    for rx in pats:
        for m in re.finditer(rx, s, re.I):
            tok = m.group(0).lower()
            if len(tok) >= 4:
                toks.append(tok)
    out: list[str] = []
    seen: set[str] = set()
    for t in toks:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _pdf_bom_unit_times_qty_matches_total(unit: float, total: float, qty: int) -> bool:
    """
    Те же допуски, что при разборе пары масс из PDF (~3% и абсолютный пол по масштабу).
    Сверка с каталогом может быть жёстче (tolerance_pct из UI), но «кг/шт vs кг Σ» из одной
    ведомости не должны оцениваться строже, чем эвристика extract_spec_rows.
    """
    q = max(1, qty)
    ref_mag = max(abs(unit), abs(total), 1.0)
    tol_abs = max(0.25, 0.004 * ref_mag)
    tol_rel = 0.03
    exp = float(unit) * q
    if abs(exp - float(total)) <= tol_abs:
        return True
    den = max(abs(float(total)), abs(exp), 1.0)
    return abs(exp - float(total)) / den <= tol_rel


def _masses_from_pdf_pair(m1: float, m2: float, qty: int) -> tuple[float, float]:
    """
    Два числа из ведомости: (кг/шт, кг всего).
    В тексте PDF порядок граф «Per unit / All unit» часто не совпадает с порядком строк —
    выбираем вариант, при котором unit×qty ≈ total.
    """
    q = max(1, qty)
    tol_abs = max(0.25, 0.004 * max(abs(m1), abs(m2), 1.0))

    if _pdf_bom_unit_times_qty_matches_total(m1, m2, qty):
        return m1, m2
    if _pdf_bom_unit_times_qty_matches_total(m2, m1, qty):
        return m2, m1
    if q == 1 and abs(m1 - m2) <= tol_abs:
        return m1, m2
    return m1, m2


@dataclass
class SpecRow:
    """Строка ведомости после разбора текста."""

    position: str
    qty: int
    length_mm: float
    profile_raw: str
    profile_key: str | None  # нормализовано, напр. 410x36
    steel: str
    assembly_mark: str = ""  # марка сборки (Б1-2), с наследованием от предыдущих строк
    note: str = ""

    mass_kg_unit: float | None = None
    mass_kg_total: float | None = None

    catalog_m2_per_m: float | None = None
    catalog_kg_per_m: float | None = None
    area_m2: float = 0.0
    row_source: str = "flat"
    layout_confidence: float | None = None


def _normalize_assembly_mark(s: str) -> str:
    """Б1_2 / Б1-2 -> единый вид."""
    t = s.strip().replace("_", "-")
    return t


# Латиница в марках из PDF (шрифт/копипаст) vs кириллица в таблице отправки.
_MARK_LATIN_TO_CYR = str.maketrans(
    {
        "A": "А",
        "B": "В",
        "C": "С",
        "E": "Е",
        "H": "Н",
        "K": "К",
        "M": "М",
        "O": "О",
        "P": "Р",
        "T": "Т",
        "X": "Х",
        "Y": "У",
        "a": "а",
        "b": "в",
        "c": "с",
        "e": "е",
        "o": "о",
        "p": "р",
        "x": "х",
        "y": "у",
    }
)


def _assembly_mark_variants_for_shipment_lookup(mark: str) -> list[str]:
    m = _normalize_assembly_mark((mark or "").strip())
    if not m:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for v in (
        m,
        m.translate(_MARK_LATIN_TO_CYR),
    ):
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    inv = str.maketrans({str(v): str(k) for k, v in _MARK_LATIN_TO_CYR.items()})
    back = m.translate(inv)
    if back and back not in seen:
        seen.add(back)
        out.append(back)
    return out


def shipment_qty_for_assembly_mark(mark: str, shipment_qty_by_mark: dict[str, int]) -> int:
    """
    Количество отправочных комплектов по марке, с учётом латиница/кириллица в тексте PDF.
    """
    if not shipment_qty_by_mark:
        return 1
    m0 = (mark or "").strip()
    if not m0:
        return 1
    for cand in _assembly_mark_variants_for_shipment_lookup(m0):
        q = shipment_qty_by_mark.get(cand)
        if q is not None:
            return max(1, int(q))
    low = m0.lower()
    for k, q in shipment_qty_by_mark.items():
        if str(k).strip().lower() == low:
            return max(1, int(q))
    return 1


def _canonical_plate_width_thickness_mm(a: int, b: int) -> tuple[int, int]:
    """
    В ячейке «— 8×80» часто толщина×ширина. Для каталога и подписи нужно B×t (80×8).
    """
    if a <= 0 or b <= 0:
        return a, b
    lo, hi = (a, b) if a <= b else (b, a)
    if lo <= 22 and hi >= lo * 2 and hi <= 800:
        return hi, lo
    return a, b


@dataclass(frozen=True)
class PlateTripleMm:
    """Пластина Tekla в сечении: толщина×ширина×длина_в_обозначении (мм)."""

    t_mm: int
    w_mm: int
    ell_mm: int


def _triple_plate_length_tol_mm(length_mm: float) -> float:
    return max(2.0, 0.002 * abs(float(length_mm)))


def _triple_geom_plausible(t_mm: int, w_mm: int, ell_mm: int) -> bool:
    if t_mm <= 0 or w_mm <= 0 or ell_mm <= 0:
        return False
    if not (3 <= t_mm <= 240 and 4 <= w_mm <= 2000 and ell_mm <= 62000):
        return False
    if t_mm > w_mm * 6 or ell_mm < min(t_mm, w_mm):  # грубый фильтр мусора
        return False
    return True


def _triple_match_from_xyz(x1: str, x2: str, x3: str) -> PlateTripleMm | None:
    try:
        t_mm, w_mm, ell_mm = int(x1), int(x2), int(x3)
    except ValueError:
        return None
    if _triple_geom_plausible(t_mm, w_mm, ell_mm):
        return PlateTripleMm(t_mm, w_mm, ell_mm)
    return None


_SEPARATOR = r"(?:\s*[x×х\*]\s*|\s*[\/]\s*|,\s*)"  # между тремя числами
_RE_TEKLA_PLATE_TRIPLE_PATTERNS: tuple[re.Pattern[str], ...] = (
    # т 10x90x270, т10×90×270; после unify лат. t уже «т»
    re.compile(
        rf"(?i)(?<![ЁА-ЯЁёа-яA-Za-z0-9])\s*т\s*[:\-]?\s*(\d{{1,5}}){_SEPARATOR}(\d{{1,5}}){_SEPARATOR}(\d{{1,5}})(?!\d)",
    ),
    # Таблица Tekla: «| т | 10x90x270 |» — между «т» и первой цифрой допускаются разделители
    re.compile(
        rf"(?i)(?<![ЁА-ЯЁёа-яA-Za-z0-9])т\s*[^0-9]{{0,48}}?(\d{{1,5}}){_SEPARATOR}(\d{{1,5}}){_SEPARATOR}(\d{{1,5}})(?!\d)",
    ),
)
# Без литеры «т» (частые выгрузки / OCR): только если первое число похоже на толщину листа
_RE_PLAIN_TEKLA_TRIPLE: re.Pattern[str] = re.compile(
    rf"(?i)(?<![A-Za-zА-ЯЁа-яё0-9/])(\d{{1,5}}){_SEPARATOR}(\d{{1,5}}){_SEPARATOR}(\d{{1,5}})(?!\d)",
)


def _plain_triple_plate_maybe(t_mm: int, w_mm: int, ell_mm: int) -> PlateTripleMm | None:
    """Осторожное принятие N×N×N как t×ширина×длина_в_обозначении (без буквы т)."""
    if not _triple_geom_plausible(t_mm, w_mm, ell_mm):
        return None
    if t_mm > 140:
        return None
    if t_mm > w_mm + 20:
        return None
    if t_mm > min(w_mm, ell_mm) + 30:
        return None
    return PlateTripleMm(t_mm, w_mm, ell_mm)


def parse_plate_t_triple_mm(unified_profile_cell: str) -> PlateTripleMm | None:
    """
    После `_clean_profile_cell` и `_unify_profile_chars` (лат. t уже «т»).
    Интерпретация Tekla Россия: t, ширина, длина_в_секции мм.
    """
    u = (unified_profile_cell or "").strip()
    if len(u) < 5:
        return None

    candidates: list[tuple[int, PlateTripleMm]] = []
    parts = [s.strip().strip("|") for s in re.split(r"\|+", u)]
    searches = "|".join(p for p in parts if p) if len(parts) > 1 else u

    def _consume(pats: Iterable[re.Pattern[str]], text: str) -> None:
        for pat in pats:
            for m in pat.finditer(text):
                tri = _triple_match_from_xyz(m.group(1), m.group(2), m.group(3))
                if tri:
                    candidates.append((m.start(), tri))

    _consume(_RE_TEKLA_PLATE_TRIPLE_PATTERNS, searches)
    if not candidates:
        _consume(_RE_TEKLA_PLATE_TRIPLE_PATTERNS, u)
    if not candidates:
        for pat_search in (searches, u):
            if not candidates:
                for m in _RE_PLAIN_TEKLA_TRIPLE.finditer(pat_search):
                    tri = _plain_triple_plate_maybe(
                        int(m.group(1)), int(m.group(2)), int(m.group(3))
                    )
                    if tri:
                        candidates.append((m.start(), tri))
            if candidates:
                break
    if not candidates:
        return None
    candidates.sort(key=lambda it: it[0])
    return candidates[0][1]


def triple_plate_catalog_width_thickness_mm(triple: PlateTripleMm) -> tuple[int, int]:
    """Ширина B и толщина t мм для каталога (90×10 из 10×90)."""
    return _canonical_plate_width_thickness_mm(int(triple.w_mm), int(triple.t_mm))


def profile_section_display_str(profile_raw: str) -> str | None:
    """Единое отображение сечения Tekla-пластины: «t …×…×…». Иначе None."""
    cleaned = _clean_profile_cell(profile_raw or "")
    u = _unify_profile_chars(cleaned)
    tr = parse_plate_t_triple_mm(u)
    if tr is None:
        return None
    # В UI — латинская «t» как у выгрузок Tekla
    return f"t {int(tr.t_mm)}×{int(tr.w_mm)}×{int(tr.ell_mm)}"


def triple_length_matches_table_mm(triple: PlateTripleMm | None, length_mm: float) -> bool:
    if triple is None:
        return True
    return abs(float(triple.ell_mm) - float(length_mm)) <= _triple_plate_length_tol_mm(length_mm)


def plate_profile_catalog_key_pref(profile_raw: str) -> tuple[str | None, PlateTripleMm | None]:
    """Ключ профиля B×t мм для строки после унификации; второй элемент — если сработала тройка."""
    cleaned = _clean_profile_cell(profile_raw or "")
    u = _unify_profile_chars(cleaned)
    tr = parse_plate_t_triple_mm(u)
    if tr is not None:
        B, tc = triple_plate_catalog_width_thickness_mm(tr)
        return f"{B}x{tc}", tr
    mwx = _RE_WXH_IN_PROFILE.search(u)
    if mwx:
        return f"{int(mwx.group(1))}x{int(mwx.group(2))}", None
    return None, None


# Эталоны для ручной/импортной проверки (см. _plate_triple_regress_smoke).
PLATE_TRIPLE_TEST_VECTORS: tuple[tuple[str, str | None, str | None], ...] = (
    ("t 10x90x270", "90x10", "t 10×90×270"),
    ("10×90×270", "90x10", "t 10×90×270"),
    ("т10х90х270", "90x10", None),
    ("т 10, 90, 270", "90x10", None),
    ("| т | 10x90x270 |", "90x10", None),
    ("194x10", "194x10", None),
    ("I30ш1", None, None),
)


def mark_hint_from_basename(filename: str) -> str:
    """Из имени вида Лист_1_Б1_2.pdf или Сборка_2СВ-1 извлечь марку (последнее совпадение)."""
    base = os.path.splitext(os.path.basename(filename))[0]
    matches = list(re.finditer(r"([А-ЯЁа-яёA-Za-z])(\d+)\s*[_\-]\s*(\d+)", base))
    if matches:
        m = matches[-1]
        letter = m.group(1).upper()
        return _normalize_assembly_mark(f"{letter}{m.group(2)}-{m.group(3)}")
    m2 = list(
        re.finditer(
            r"(\d+[А-ЯЁA-Zа-яё][A-Za-zА-ЯЁа-яё0-9]{0,12}\s*[_\-]\s*\d+)",
            base,
        )
    )
    if m2:
        return _normalize_assembly_mark(m2[-1].group(1))
    return ""


_RE_MARK_TOKEN = re.compile(r"([А-ЯЁA-Zа-яёa-z])(\d+)\s*[_\-]\s*(\d+)")
# Марка вида 2СВ-1 (цифра в начале — Tekla / КМД)
_RE_MARK_TOKEN_DIGIT_FIRST = re.compile(
    r"(\d+[А-ЯЁA-Zа-яё][А-ЯЁA-Zа-яё0-9]{0,8})\s*[_\-]\s*(\d+)(?![0-9])",
)


def _normalized_marks_in_context(ctx: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for mm in _RE_MARK_TOKEN.finditer(ctx):
        letter = mm.group(1).upper()
        mk = _normalize_assembly_mark(f"{letter}{mm.group(2)}-{mm.group(3)}")
        if mk not in seen:
            seen.add(mk)
            found.append(mk)
    for mm in _RE_MARK_TOKEN_DIGIT_FIRST.finditer(ctx):
        mk = _normalize_assembly_mark(f"{mm.group(1)}-{mm.group(2)}")
        if mk not in seen:
            seen.add(mk)
            found.append(mk)
    return found


def _shipment_mark_from_line(line: str) -> str | None:
    """Марка отправочного элемента в одной строке (Б1-3 или 2СВ-1)."""
    s = (line or "").strip()
    if not s or len(s) > 48:
        return None
    m = _RE_MARK_TOKEN.fullmatch(s)
    if m:
        letter = m.group(1).upper()
        return _normalize_assembly_mark(f"{letter}{m.group(2)}-{m.group(3)}")
    m = _RE_MARK_TOKEN_DIGIT_FIRST.fullmatch(s)
    if m:
        return _normalize_assembly_mark(f"{m.group(1)}-{m.group(2)}")
    if _is_tekla_mark_cell(s) and 1 <= len(s) <= 24:
        return _normalize_assembly_mark(s)
    return None


def _tekla_shipment_qty_after_mark_line(lines: list[str], mark_idx: int) -> int | None:
    """
    В верстке Tekla количество часто под массой марки: 2СВ-1 → 317.645 → 5 → 317.645.
    Берём первое целое 1…500 после строк марки, пропуская вещественные массы.
    """
    for j in range(mark_idx + 1, min(mark_idx + 14, len(lines))):
        t = lines[j].strip().replace(" ", "").replace(",", ".")
        if re.match(r"^\d+\.\d+$", t):
            continue
        if re.match(r"^\d+[.,]\d+$", lines[j].strip().replace(" ", "")):
            continue
        m = re.match(r"^(\d{1,3})$", lines[j].strip())
        if not m:
            continue
        v = int(m.group(1))
        if 1 <= v <= 500:
            return v
    return None


_RE_SHIPMENT_BLOCK_ANCHOR = re.compile(
    r"(?:Ведомость\s+отправочных|ведомость\s+отправочных\s+элементов"
    r"|Statement\s+assembly\s+elements?|Statement\s+assembly)",
    re.IGNORECASE,
)
_RE_QTY_HINT = re.compile(
    r"(?:q-ty|qty|quantity|кол[-\s]?во|количество|pcs|шт\.?)\b",
    re.IGNORECASE,
)


def extract_shipment_qty_by_mark(full_text: str) -> dict[str, int]:
    """
    Число отправочных комплектов по марке из блока «Ведомость отправочных элементов».
    Спецификация деталей задаёт один комплект; эта таблица — сколько таких комплектов на чертеже/отправке.
    """
    out: dict[str, int] = {}
    m = _RE_SHIPMENT_BLOCK_ANCHOR.search(full_text or "")
    if not m:
        return out
    window = full_text[m.end() : m.end() + 5200]
    lines = [ln.strip() for ln in window.splitlines() if ln.strip()]

    out_col: dict[str, int] = {}
    for i, line in enumerate(lines):
        if not _RE_QTY_HINT.search(line):
            continue
        nums = [int(x) for x in re.findall(r"\b(\d{1,4})\b", line)]
        qty_candidates = [v for v in nums if 1 <= v <= 500 and not (1900 <= v <= 2100)]
        if not qty_candidates:
            continue
        ctx = "\n".join(lines[max(0, i - 6) : i + 1])
        marks_found = _normalized_marks_in_context(ctx)
        if len(marks_found) == 1:
            reasonable = [x for x in qty_candidates if x <= 120]
            if reasonable:
                v = max(reasonable)
            elif len(qty_candidates) == 1:
                v = qty_candidates[0]
            else:
                v = min(qty_candidates)
            out_col[marks_found[0]] = v

    # Tekla: строка = только марка, количество — под массами (перекрывает out_col при совпадении марки).
    out_tekla: dict[str, int] = {}
    seen_m: set[str] = set()
    for i, line in enumerate(lines[:55]):
        mk = _shipment_mark_from_line(line)
        if mk is None or mk in seen_m:
            continue
        q = _tekla_shipment_qty_after_mark_line(lines, i)
        if q is not None:
            out_tekla[mk] = q
            seen_m.add(mk)

    out: dict[str, int] = {**out_col}
    for mk, q in out_tekla.items():
        out[mk] = q
    if out:
        return out
    # Запасной путь: «Марка … Б1-3» и на соседних строках одно небольшое число
    for i, line in enumerate(lines[:15]):
        if not re.search(r"(?:элемент|assembly|mark|марка)\b", line, re.I):
            continue
        mm_list = list(_RE_MARK_TOKEN.finditer(line))
        if len(mm_list) != 1:
            continue
        mm = mm_list[0]
        letter = mm.group(1).upper()
        mk = _normalize_assembly_mark(f"{letter}{mm.group(2)}-{mm.group(3)}")
        tail = "\n".join(lines[i : min(len(lines), i + 4)])
        small = [int(x) for x in re.findall(r"\b(\d{1,3})\b", tail) if 1 <= int(x) <= 200]
        if len(small) == 1:
            out[mk] = small[0]
            break
    return out


def extract_shipment_qty_for_bom_pages(pages_text: list[str], bom_page_indices: list[int]) -> dict[str, int]:
    """
    Отправочные марки только с страниц, где есть ведомость, плюс следующая страница
    (типичная вёрстка Tekla). Избегает глобального «первые 5200 символов всего PDF».
    """
    merged: dict[str, int] = {}
    n = len(pages_text)
    if not bom_page_indices:
        return merged
    ordered = sorted({int(i) for i in bom_page_indices if 0 <= int(i) < n})
    for i in ordered:
        parts = [(pages_text[i] or "")]
        if i + 1 < n:
            parts.append(pages_text[i + 1] or "")
        chunk = "\n".join(parts)
        d = extract_shipment_qty_by_mark(chunk)
        for mk, qty in d.items():
            merged[str(mk)] = int(qty)
    if merged:
        return merged
    return extract_shipment_qty_by_mark("\n".join(pages_text))


_RE_PLATE_SLUG_ROLLED = re.compile(
    r"(?:двутавр|швеллер|швеллеро|уголок|равнополочный|тавр|балка|сварнаябалка|круг|труба|рельс|швелл)",
    re.IGNORECASE,
)

# Префикс L / ∠ в ячейке профиля (Tekla: «L 90x7» — равнополочный уголок).
_RE_ANGLE_PREFIX_MARK = re.compile(r"(?i)(?:^|[\s;,:])\s*[L∠]\s*\d")


def is_angle_like_profile(profile_raw: str) -> bool:
    """Уголок: явная отметка L…×… или слово «равнополочн…» в ячейке."""
    t = _unify_profile_chars((profile_raw or "").strip())
    if not t:
        return False
    if _RE_ANGLE_PREFIX_MARK.search(t):
        return True
    if re.search(r"(?i)равнополочн", t):
        return True
    return False


def is_plate_like_profile(profile_raw: str) -> bool:
    """Лист/полоса B×t в ячейке профиля; длина L — в колонке длины (формат B×L×t)."""
    raw = _clean_profile_cell((profile_raw or "").strip())
    u = _unify_profile_chars(raw)
    if not u:
        return False
    if parse_plate_t_triple_mm(u):
        slug = _slug_catalog_key(u)
        if _RE_PLATE_SLUG_ROLLED.search(slug) or _RE_PLATE_SLUG_ROLLED.search(raw):
            return False
        if is_angle_like_profile(profile_raw):
            return False
        return True

    if is_angle_like_profile(profile_raw):
        return False
    if _RE_PLATE_SLUG_ROLLED.search(_slug_catalog_key(u)) or _RE_PLATE_SLUG_ROLLED.search(raw):
        return False
    keys = _all_wxh_keys_from_text(u)
    if len(keys) != 1:
        return False
    pa = keys[0].lower().split("x")
    if len(pa) != 2:
        return False
    w_mm, t_mm = int(pa[0]), int(pa[1])
    return _plate_wxh_plausible(w_mm, t_mm)


def plate_profile_dims_mm(
    profile_raw: str,
    length_mm: float,
    mass_kg_total: float | None = None,
    qty: int = 1,
) -> str | None:
    """Человекочитаемо: B×L×t мм (ширина / длина по ведомости / толщина)."""
    raw = _clean_profile_cell(profile_raw or "")
    if not raw:
        return None
    u = _unify_profile_chars(raw)
    triple = parse_plate_t_triple_mm(u)
    if triple is not None and not _RE_PLATE_SLUG_ROLLED.search(_slug_catalog_key(u)):
        b, thick = triple_plate_catalog_width_thickness_mm(triple)
        L = int(round(float(length_mm)))
        if mass_kg_total is not None and qty >= 1 and length_mm >= 1.0:
            dlen = (float(length_mm) / 1000.0) * max(1, int(qty))
            if dlen > 1e-6:
                kgpm_obs = float(mass_kg_total) / dlen
                kgpm_plate = _plate_kg_per_m(b, thick)
                if kgpm_plate > 1e-6 and kgpm_obs > kgpm_plate * 1.15:
                    return None
        return f"Лист {b}×{L}×{thick}"

    if not is_plate_like_profile(raw):
        return None
    u2 = _unify_profile_chars(raw)
    keys = _all_wxh_keys_from_text(u2)
    if len(keys) != 1:
        return None
    pa = keys[0].lower().split("x")
    b, thick = int(pa[0]), int(pa[1])
    b, thick = _canonical_plate_width_thickness_mm(b, thick)
    L = int(round(float(length_mm)))
    if mass_kg_total is not None and qty >= 1 and length_mm >= 1.0:
        dlen = (float(length_mm) / 1000.0) * max(1, int(qty))
        if dlen > 1e-6:
            kgpm_obs = float(mass_kg_total) / dlen
            kgpm_plate = _plate_kg_per_m(b, thick)
            if kgpm_plate > 1e-6 and kgpm_obs > kgpm_plate * 1.15:
                return None
    return f"Лист {b}×{L}×{thick}"


def angle_profile_dims_mm(
    profile_raw: str,
    length_mm: float,
    mass_kg_total: float | None = None,
    qty: int = 1,
) -> str | None:
    """
    Подпись для уголка: явный L в ячейке или одна пара B×t при массе погонки,
    существенно большей, чем у полосы тех же размеров (типично для проката).
    """
    raw = _clean_profile_cell(profile_raw or "")
    u = _unify_profile_chars(raw)
    m_wxh = _RE_WXH_IN_PROFILE.search(u)
    if not m_wxh:
        return None
    w, t = int(m_wxh.group(1)), int(m_wxh.group(2))
    L = int(round(float(length_mm)))
    explicit = is_angle_like_profile(raw)
    if explicit:
        if not _plate_wxh_plausible(w, t):
            return None
        return f"Уголок L{w}×{t}; L={L} мм"
    if mass_kg_total is None or qty < 1 or length_mm < 200:
        return None
    if not _plate_wxh_plausible(w, t):
        return None
    dlen = (float(length_mm) / 1000.0) * max(1, int(qty))
    if dlen <= 1e-6:
        return None
    kgpm_obs = float(mass_kg_total) / dlen
    kgpm_plate = _plate_kg_per_m(w, t)
    if kgpm_plate > 1e-9 and kgpm_obs > kgpm_plate * 1.15:
        return f"Уголок L{w}×{t}; L={L} мм"
    return None


def _pretty_gost_rolled_slug(slug_lower: str) -> str:
    """20ш1 → 20Ш1, 10п → 10П, 40к2 → 40К2 (для подписи в таблице)."""
    s = (slug_lower or "").strip().lower()
    if not s:
        return ""
    if re.fullmatch(r"\d{1,4}п", s):
        return f"{s[:-1]}П"
    m = re.fullmatch(r"(\d{1,4})([кшщб])(\d{1,4})", s)
    if m:
        n1, ch, n2 = m.group(1), m.group(2), m.group(3)
        up = {"к": "К", "ш": "Ш", "щ": "Щ", "б": "Б"}.get(ch, ch.upper())
        return f"{n1}{up}{n2}"
    return slug_lower


def rolled_section_profile_label(
    profile_raw: str,
    length_mm: float,
) -> tuple[str | None, str]:
    """
    Человекочитаемая подпись для сортамента ГОСТ: швеллер 10П, 20Ш1; двутавр 40К2 и т.п.
    Не вызывать для уголка/полосы — их обрабатывают отдельные функции.
    """
    raw = _clean_profile_cell(profile_raw or "")
    if not raw:
        return None, ""
    if is_angle_like_profile(raw) or is_plate_like_profile(raw):
        return None, ""
    u = _unify_profile_chars(raw)
    body = _slug_catalog_key(u)
    if len(body) < 3:
        return None, ""
    for prefix in (
        "швеллеро",
        "швеллер",
        "сварнаябалка",
        "двутавр",
        "двут",
        "тавртавр",
        "тавр",
        "балка",
        "равнополочныйуголок",
        "уголокравнополочный",
        "уголок",
    ):
        if body.startswith(prefix) and len(body) > len(prefix) + 1:
            body = body[len(prefix) :]
            break
    kind = ""
    pretty = ""
    if re.fullmatch(r"\d{1,4}п", body, re.I):
        kind, pretty = "швеллер", f"Швеллер {_pretty_gost_rolled_slug(body)}"
    elif re.fullmatch(r"\d{1,4}[шщ]\d{1,4}", body, re.I):
        kind, pretty = "швеллер", f"Швеллер {_pretty_gost_rolled_slug(body)}"
    elif re.fullmatch(r"\d{1,4}[бк]\d{1,4}", body, re.I):
        kind, pretty = "двутавр", f"Двутавр {_pretty_gost_rolled_slug(body)}"
    else:
        return None, ""
    L = int(round(float(length_mm)))
    return f"{pretty}; L={L} мм", kind


def _catalog_bundle_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def default_catalog_path() -> str:
    """Локальный CSV: дополнения и переопределения поверх общей базы."""
    return os.path.join(_catalog_bundle_dir(), "профили_м2_на_пм.csv")


def default_catalog_paths() -> list[str]:
    """
    Слои (раньше → позже, поздние перекрывают ключи):
    профили_база.csv → [профили_база_облако.csv если включено в каталог_url.json]
    → профили_м2_на_пм.csv (проект).
    """
    d = _catalog_bundle_dir()
    base = os.path.join(d, "профили_база.csv")
    cloud = os.path.join(d, "профили_база_облако.csv")
    local = os.path.join(d, "профили_м2_на_пм.csv")
    out: list[str] = []
    if os.path.isfile(base):
        out.append(base)
    cloud_on = False
    try:
        from каталог_удалённый import read_config as _remote_cat_cfg

        cloud_on = bool(_remote_cat_cfg().get("enabled"))
    except Exception:
        cloud_on = False
    if cloud_on:
        try:
            if os.path.isfile(cloud) and os.path.getsize(cloud) > 32:
                out.append(cloud)
        except OSError:
            pass
    if os.path.isfile(local):
        out.append(local)
    if out:
        return out
    legacy = os.path.join(d, "профили_м2_на_пм.csv")
    return [legacy] if os.path.isfile(legacy) else []


def _catalog_paths_arg(path: str | None | Sequence[str]) -> list[str]:
    if isinstance(path, str):
        if not str(path).strip():
            return default_catalog_paths()
        return [path] if os.path.isfile(path) else []
    if path is None:
        return default_catalog_paths()
    return [p for p in path if p and os.path.isfile(str(p))]


def _read_catalog_file(path: str) -> tuple[dict[str, float], dict[str, float], bool]:
    m2: dict[str, float] = {}
    kg: dict[str, float] = {}
    any_kg_in_file = False
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        delim = ";" if sample.count(";") >= sample.count(",") else ","
        r = csv.reader(f, delimiter=delim)
        for row in r:
            if not row or not str(row[0]).strip() or str(row[0]).strip().startswith(";"):
                continue
            k0 = str(row[0]).strip()
            if k0.startswith("#"):
                continue
            low = k0.lower()
            if low in ("ключ", "key", "профиль", "profile", "кг_на_пм", "kg_per_m"):
                continue
            try:
                v_m2 = float(str(row[1]).replace(",", ".").strip())
            except (ValueError, IndexError):
                continue
            v_kg: float | None = None
            if len(row) > 2 and str(row[2]).strip():
                try:
                    v_kg = float(str(row[2]).replace(",", ".").strip())
                    any_kg_in_file = True
                except ValueError:
                    v_kg = None
            nk = _normalize_profile_key(k0)
            if nk:
                kl = nk.lower()
                m2[kl] = v_m2
                if v_kg is not None:
                    kg[kl] = v_kg
            sk = _slug_catalog_key(k0)
            if sk:
                m2[sk] = v_m2
                if v_kg is not None:
                    kg[sk] = v_kg
    if not any_kg_in_file:
        kg.clear()
    return m2, kg, any_kg_in_file


def load_catalog_tables(path: str | None | Sequence[str] = None) -> tuple[dict[str, float], dict[str, float]]:
    """
    CSV: ключ; м2_на_пм [; кг_на_пм]
    Несколько файлов: поздние перезаписывают ранние по одному и тому же ключу.
    path=None — default_catalog_paths() (база + локальный CSV).
    """
    paths = _catalog_paths_arg(path)
    m2: dict[str, float] = {}
    kg: dict[str, float] = {}
    for p in paths:
        dm2, dkg, had_kg = _read_catalog_file(p)
        m2.update(dm2)
        if had_kg:
            kg.update(dkg)
    return m2, kg


def load_catalog(path: str | None | Sequence[str] = None) -> dict[str, float]:
    """Обратная совместимость: только м²/п.м."""
    m2, _ = load_catalog_tables(path)
    return m2


def metal_lines_missing_catalog_hints(metal_lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Строки ведомости без m2_per_m — для списка «что добавить в CSV»."""
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for ml in metal_lines:
        if ml.get("m2_per_m") is not None:
            continue
        raw = str(ml.get("profile_raw") or "").strip()
        pk = str(ml.get("profile_key") or "").strip()
        pos = str(ml.get("position") or "")
        sig = (pos, raw, pk)
        if sig in seen:
            continue
        seen.add(sig)
        out.append({"position": pos, "profile_raw": raw, "profile_key": pk or None})
    return out


_RE_WXH_PAIR = re.compile(r"^(\d+)x(\d+)$", re.IGNORECASE)


def _swapped_wxh_variants(key_like: str | None) -> list[str]:
    """Варианты ключа BxA для прямоугольного сечения (в CSV иногда обратный порядок)."""
    if not key_like:
        return []
    m = _RE_WXH_PAIR.match(str(key_like).strip().lower().replace("х", "x"))
    if not m:
        return []
    a, b = int(m.group(1)), int(m.group(2))
    if a == b:
        return []
    sw = f"{b}x{a}"
    out = [sw]
    for v in _slug_variants(sw):
        if v not in out:
            out.append(v)
    return out


def similar_catalog_dim_keys(hint: str, catalog_m2: dict[str, float], limit: int = 5) -> list[str]:
    """До limit ключей вида AxB из каталога, ближайших к hint по сумме модулей разностей сторон."""
    h = (hint or "").strip().lower().replace("х", "x")
    hm = re.search(r"(\d{1,5})\s*(?:x|[-–—])\s*(\d{1,3})", h, re.I)
    if not hm:
        out: list[str] = []
        for k in catalog_m2:
            kl = k.lower()
            if not h:
                break
            if h in kl or kl in h:
                out.append(k)
                if len(out) >= limit:
                    break
        return out[:limit]
    a0, b0 = int(hm.group(1)), int(hm.group(2))
    scored: list[tuple[int, str]] = []
    for k in catalog_m2:
        km = re.search(r"(\d{1,5})\s*(?:x|[-–—])\s*(\d{1,3})", k.lower().replace("х", "x"), re.I)
        if not km:
            continue
        a1, b1 = int(km.group(1)), int(km.group(2))
        d1 = abs(a1 - a0) + abs(b1 - b0)
        d2 = abs(a1 - b0) + abs(b1 - a0)
        scored.append((min(d1, d2), k))
    scored.sort(key=lambda t: (t[0], t[1]))
    seen: set[str] = set()
    res: list[str] = []
    for d, k in scored:
        if d > 120:
            break
        kl = k.lower()
        if kl not in seen:
            seen.add(kl)
            res.append(k)
        if len(res) >= limit:
            break
    return res


def _fix_ocr_digit_confusables(s: str) -> str:
    """Типичные OCR-замены в обозначениях: буква О как ноль, З как цифра 3."""
    if not s:
        return s
    t = str(s)
    t = re.sub(r"(?<=\d)[Оо](?=\d)", "0", t)
    t = re.sub(r"(?<=\d)[Оо](?=[кКшШщЩбБпП])", "0", t)
    t = re.sub(r"(?<=[кКшШщЩбБпП])[Оо](?=\d)", "0", t)
    t = re.sub(r"(?<=\d)З(?=\d)", "3", t)
    t = re.sub(r"(?<=\d)з(?=\d)", "3", t)
    return t


def _append_row_note(r: SpecRow, text: str) -> None:
    t = str(text or "").strip()
    if not t:
        return
    r.note = f"{r.note}; {t}".strip("; ") if r.note else t


_RE_CAT_ROLLED_KEY = re.compile(r"^(\d{2,4})(к|ш|б|п)(\d{1,3})?$")


def _rolled_tuple_from_slug(slug: str) -> tuple[str, int, int | None] | None:
    """Возвращает (вид, номер, подномер|None) для строк каталога вида 40к2, 30ш1, 20п."""
    if not slug:
        return None
    s = slug.lower()
    m = re.search(r"(\d{2,4})\s*к\s*(\d{1,3})(?![0-9])", s)
    if m:
        return ("к", int(m.group(1)), int(m.group(2)))
    m = re.search(r"(\d{2,4})\s*ш\s*(\d{1,3})(?![0-9])", s)
    if m:
        return ("ш", int(m.group(1)), int(m.group(2)))
    m = re.search(r"(\d{2,4})\s*б\s*(\d{1,3})(?![0-9])", s)
    if m:
        return ("б", int(m.group(1)), int(m.group(2)))
    m = re.search(r"(\d{2,4})\s*п\s*(\d{1,3})(?![0-9])", s)
    if m:
        return ("п", int(m.group(1)), int(m.group(2)))
    m = re.search(r"(\d{2,4})\s*п(?![0-9a-zа-яё])", s)
    if m:
        return ("п", int(m.group(1)), None)
    m = re.search(r"(\d{2,4})\s*к(?![0-9a-zа-яё])", s)
    if m:
        return ("к", int(m.group(1)), None)
    return None


def _nearest_rolled_catalog_key(slug: str, catalog_m2: dict[str, float]) -> str | None:
    rt = _rolled_tuple_from_slug(slug)
    if rt is None:
        return None
    kind, n0, s0 = rt
    best: tuple[int, str] | None = None
    for ck in catalog_m2:
        mk = _RE_CAT_ROLLED_KEY.match(ck.lower())
        if not mk or mk.group(2) != kind:
            continue
        n1 = int(mk.group(1))
        sub_s = mk.group(3)
        s1 = int(sub_s) if sub_s else None
        dn = abs(n1 - n0)
        if s0 is not None and s1 is not None:
            ds = abs(s1 - s0)
        elif s0 is None and s1 is not None:
            ds = min(6, s1 + 1)
        elif s0 is not None and s1 is None:
            ds = 6 + min(8, s0)
        else:
            ds = 0
        d = dn * 18 + ds
        if best is None or d < best[0]:
            best = (d, ck)
    if best is not None and best[0] <= 96:
        return best[1]
    return None


def _catalog_pick_by_bom_kg_per_m(
    kg_obs: float,
    catalog_m2: dict[str, float],
    cat_k: dict[str, float],
    *,
    max_rel_err: float = 0.30,
) -> tuple[float | None, float | None, str | None]:
    if kg_obs <= 1e-9 or not cat_k:
        return None, None, None
    best: tuple[float, float, float, str] | None = None
    for ck, kpm in cat_k.items():
        if kpm < 1e-9:
            continue
        mpm = catalog_m2.get(ck)
        if mpm is None:
            continue
        ref = max(abs(kg_obs), abs(kpm), 1.0)
        err = abs(kpm - kg_obs) / ref
        if err <= max_rel_err and (best is None or err < best[0]):
            best = (err, mpm, kpm, ck)
    if best is None:
        return None, None, None
    return best[1], best[2], best[3]


def _fuzzy_best_catalog_key(slug: str, catalog_m2: dict[str, float], *, min_ratio: float = 0.70) -> str | None:
    if len(slug) < 4:
        return None
    best_r = 0.0
    best_k: str | None = None
    ln = len(slug)
    for ck in catalog_m2:
        if abs(len(ck) - ln) > max(ln, 14):
            continue
        r = SequenceMatcher(None, slug, ck).ratio()
        if r > best_r:
            best_r, best_k = r, ck
    if best_k is not None and best_r >= min_ratio:
        return best_k
    return None


def _fuzzy_catalog_key_substring(slug: str, catalog_m2: dict[str, float], *, min_ratio: float = 0.50) -> str | None:
    if len(slug) < 4:
        return None
    best_r = 0.0
    best_k: str | None = None
    for ck in catalog_m2:
        if len(ck) < 4:
            continue
        if slug not in ck and ck not in slug:
            continue
        r = SequenceMatcher(None, slug, ck).ratio()
        if r >= min_ratio and r > best_r:
            best_r, best_k = r, ck
    return best_k


def _longest_catalog_key_containing_slug(slug: str, catalog_m2: dict[str, float]) -> str | None:
    if len(slug) < 4:
        return None
    best: str | None = None
    best_len = 0
    sl = slug.lower()
    for ck in catalog_m2:
        clk = ck.lower()
        if sl in clk and len(clk) > best_len:
            best, best_len = ck, len(clk)
    return best


def _dim_neighbor_catalog_key(hint: str, catalog_m2: dict[str, float], *, max_d: int = 100) -> str | None:
    sim = similar_catalog_dim_keys(hint, catalog_m2, limit=1)
    if not sim:
        return None
    k0 = sim[0]
    h = hint.strip().lower().replace("х", "x")
    hm = re.search(r"(\d{1,5})\s*(?:x|[-–—])\s*(\d{1,3})", h, re.I)
    if not hm:
        return k0
    a0, b0 = int(hm.group(1)), int(hm.group(2))
    km = re.search(r"(\d{1,5})\s*(?:x|[-–—])\s*(\d{1,3})", k0.lower().replace("х", "x"), re.I)
    if not km:
        return None
    a1, b1 = int(km.group(1)), int(km.group(2))
    d = min(abs(a1 - a0) + abs(b1 - b0), abs(a1 - b0) + abs(b1 - a0))
    if d <= max_d:
        return k0
    return None


def _heuristic_m2pm_from_kgpm(kgpm: float) -> float:
    """Грубая оценка м²/м по фактической линейной массе (когда ключа в CSV нет)."""
    if kgpm <= 1e-9:
        return 1.0
    if kgpm >= 28.0:
        m = kgpm * 0.0078
    elif kgpm >= 7.5:
        m = kgpm * 0.011
    else:
        m = kgpm * 0.078
    return round(max(0.18, min(5.5, m)), 4)


def _fallback_median_m2(catalog_m2: dict[str, float]) -> float:
    vals = [float(v) for v in catalog_m2.values() if float(v) > 1e-9]
    if not vals:
        return 1.0
    vals.sort()
    mid = len(vals) // 2
    if len(vals) % 2:
        return round(vals[mid], 4)
    return round((vals[mid - 1] + vals[mid]) / 2.0, 4)


def _normalize_profile_key(s: str) -> str:
    s = _unify_profile_chars(s).strip().lower().replace("х", "x")
    m = re.search(r"(\d{1,5})\s*(?:x|[-–—*/])\s*(\d{1,3})", s, re.I)
    if m:
        return f"{int(m.group(1))}x{int(m.group(2))}"
    return re.sub(r"[^a-zа-яё0-9]+", "", s, flags=re.I)


def _slug_catalog_key(s: str) -> str:
    return re.sub(r"[^a-zа-яё0-9]+", "", _unify_profile_chars(s).strip().lower(), flags=re.I)


def _is_tekla_mark_cell(s: str) -> bool:
    """Марка элемента в графе «Марка» (2СВ-1, Б1-3), не чистое число и не профиль AxB."""
    t = (s or "").strip()
    if not t or len(t) > 40:
        return False
    u = _unify_profile_chars(t).strip()
    if re.fullmatch(r"\d{1,5}\s*[x×х]\s*\d{1,3}", u, re.I):
        return False
    if re.fullmatch(r"\d{1,4}", t):
        return False
    if re.fullmatch(r"\d{1,3}", t):
        return False
    if not re.search(r"[A-Za-zА-ЯЁа-яё]", t):
        return False
    if not re.search(r"\d", t):
        return False
    return True


# Краткое обозначение проката в одной ячейке: 30ш1, 40к2, 24п (швеллер / двутавр / швеллер «П»).
_RE_ROLLED_SIZING_TOKEN = re.compile(
    r"(?:^\d{1,4}[кшщб]\d{1,4}$|^\d{1,4}п$)",
    re.IGNORECASE,
)


def _looks_like_profile_tekla(s: str) -> bool:
    """
    Ячейка «Профиль» в выгрузке Tekla: полоса B×t или сортамент (30Ш1, Швеллер 24П, 40К2…).
    Раньше принимались только размеры с «×», из‑за чего строки со швеллерами отбрасывались.
    """
    uu = _unify_profile_chars(s or "").strip()
    if not uu:
        return False
    if parse_plate_t_triple_mm(uu):
        return True
    if _RE_WXH_IN_PROFILE.search(uu):
        return True
    sl = _slug_catalog_key(uu)
    if len(sl) >= 3 and _RE_ROLLED_SIZING_TOKEN.match(sl):
        return True
    if len(sl) >= 5:
        for prefix in (
            "швеллеро",
            "швеллер",
            "сварнаябалка",
            "двутавр",
            "двут",
            "тавртавр",
            "тавр",
            "балка",
            "равнополочныйуголок",
            "уголокравнополочный",
            "уголок",
        ):
            if sl.startswith(prefix) and len(sl) > len(prefix) + 2:
                suf = sl[len(prefix) :]
                if _RE_ROLLED_SIZING_TOKEN.match(suf) or _RE_WXH_IN_PROFILE.search(suf):
                    return True
    if re.search(r"(?i)(?:^|[\s,;])(?:швелл|двутавр|сварн\w*балк)", uu) and re.search(r"\d", uu):
        return True
    if re.search(r"(?i)(?:^|[\s,;])уголок", uu) and re.search(r"\d", uu):
        return True
    return False


def _token_bom_length_mm(tok: str) -> float | None:
    """Длина детали, мм из отдельного токена (КМД/ГОСТ)."""
    t = str(tok).strip().replace(",", ".")
    if not re.match(r"^\d{2,6}(?:\.\d+)?$", t):
        return None
    try:
        v = float(t)
    except ValueError:
        return None
    if v < 10 or v > 62000:
        return None
    return v


def _looks_like_gost_section_cell(s: str) -> bool:
    """Колонка «Сечение»: прокат, полосы t×…, швеллер/двутавр после чистки PDF."""
    raw = _clean_profile_cell(str(s or ""))
    if not raw.strip():
        return False
    return bool(_looks_like_profile_tekla(raw))


def _finalize_kmd_material_row_tail(
    position: str,
    profile_raw: str,
    qty: int,
    length_mm: float,
    steel: str,
    *,
    mu: float | None,
    mt: float | None,
    assembly_mark_base: str,
    fallback_mark: str,
    basename_hint: str | None,
    note_fragments: list[str],
    j_notes: int,
    lines: list[str],
) -> tuple[SpecRow, int]:
    n = len(lines)
    k = int(j_notes)
    note_parts: list[str] = list(note_fragments)
    while k < n and re.match(r"^RAL\d+", lines[k], re.I):
        note_parts.append(lines[k].strip())
        k += 1
    assembly_mark = (
        (assembly_mark_base or "").strip()
        or (mark_hint_from_basename(basename_hint or "") or "")
        or fallback_mark
    )
    triple_note: list[str] = []
    pk, triple_prof = plate_profile_catalog_key_pref(profile_raw)
    if triple_prof is not None:
        tol_l = _triple_plate_length_tol_mm(length_mm)
        if abs(float(triple_prof.ell_mm) - float(length_mm)) > tol_l:
            triple_note.append(
                f"сеч:Lsect={int(triple_prof.ell_mm)}≠Lтаб={int(round(length_mm))}мм"
            )
    fragments = [*note_parts, *triple_note]
    note = "; ".join([x for x in fragments if x]).strip("; ")
    if pk is None:
        nk = _normalize_profile_key(profile_raw)
        if nk and not re.fullmatch(r"\d{1,6}", nk):
            pk = nk
    row = SpecRow(
        position=position,
        qty=qty,
        length_mm=length_mm,
        profile_raw=profile_raw,
        profile_key=pk,
        steel=steel,
        assembly_mark=assembly_mark,
        note=note,
        mass_kg_unit=mu,
        mass_kg_total=mt,
    )
    return row, k


def _try_extract_gost_kmd_row(
    lines: list[str],
    pos_index: int,
    last_mark: str,
    fallback_mark: str,
    basename_hint: str | None,
) -> tuple[SpecRow, int] | None:
    """
    Спецификация КМ/КМД: № → кол → Сечение → Длина мм → массы… → марка стали.
    """
    n = len(lines)
    pos = lines[pos_index]
    if not re.match(r"^\d{1,4}$", pos):
        return None
    j = pos_index + 1
    if j >= n or not re.match(r"^\d{1,3}$", lines[j]):
        return None
    qty = int(lines[j])
    j += 1
    if j >= n:
        return None
    profile_raw = _clean_profile_cell(lines[j])
    if not _looks_like_gost_section_cell(profile_raw):
        return None
    j += 1
    if j >= n:
        return None
    length_mm = _token_bom_length_mm(lines[j])
    if length_mm is None:
        return None
    j += 1
    raw_m: list[float] = []
    while j < n and len(raw_m) < 2 and re.match(r"^\d+[.,]?\d*$", lines[j].replace(" ", "")):
        raw = lines[j].replace(" ", "").replace(",", ".")
        try:
            raw_m.append(float(raw))
        except ValueError:
            break
        j += 1
    if len(raw_m) < 1:
        return None
    mu: float | None = None
    mt: float | None = None
    if len(raw_m) == 2:
        mu, mt = _masses_from_pdf_pair(raw_m[0], raw_m[1], qty)
    else:
        mu = mt = raw_m[0]
    if j >= n:
        return None
    steel = lines[j].strip()
    if not _RE_STEEL.match(steel) and not re.match(r"^C\d", steel, re.I):
        return None
    j += 1
    row, k = _finalize_kmd_material_row_tail(
        pos,
        profile_raw,
        qty,
        length_mm,
        steel,
        mu=mu,
        mt=mt,
        assembly_mark_base=last_mark,
        fallback_mark=fallback_mark,
        basename_hint=basename_hint,
        note_fragments=[],
        j_notes=j,
        lines=lines,
    )
    return row, k


def _try_extract_length_then_section_row(
    lines: list[str],
    pos_index: int,
    last_mark: str,
    fallback_mark: str,
    basename_hint: str | None,
) -> tuple[SpecRow, int] | None:
    """Порядок при склейке текста из PDF: № → кол → Длина → Сечение → массы… → сталь."""
    n = len(lines)
    pos = lines[pos_index]
    if not re.match(r"^\d{1,4}$", pos):
        return None
    j = pos_index + 1
    if j >= n or not re.match(r"^\d{1,3}$", lines[j]):
        return None
    qty = int(lines[j])
    j += 1
    if j >= n:
        return None
    length_mm = _token_bom_length_mm(lines[j])
    if length_mm is None:
        return None
    j += 1
    if j >= n:
        return None
    profile_raw = _clean_profile_cell(lines[j])
    if not _looks_like_gost_section_cell(profile_raw):
        return None
    j += 1
    raw_m: list[float] = []
    while j < n and len(raw_m) < 2 and re.match(r"^\d+[.,]?\d*$", lines[j].replace(" ", "")):
        raw = lines[j].replace(" ", "").replace(",", ".")
        try:
            raw_m.append(float(raw))
        except ValueError:
            break
        j += 1
    if len(raw_m) < 1:
        return None
    mu: float | None = None
    mt: float | None = None
    if len(raw_m) == 2:
        mu, mt = _masses_from_pdf_pair(raw_m[0], raw_m[1], qty)
    else:
        mu = mt = raw_m[0]
    if j >= n:
        return None
    steel = lines[j].strip()
    if not _RE_STEEL.match(steel) and not re.match(r"^C\d", steel, re.I):
        return None
    j += 1
    row, k = _finalize_kmd_material_row_tail(
        pos,
        profile_raw,
        qty,
        length_mm,
        steel,
        mu=mu,
        mt=mt,
        assembly_mark_base=last_mark,
        fallback_mark=fallback_mark,
        basename_hint=basename_hint,
        note_fragments=[],
        j_notes=j,
        lines=lines,
    )
    return row, k


def _try_extract_tekla_row(
    lines: list[str],
    pos_index: int,
    last_mark: str,
    fallback_mark: str,
    basename_hint: str | None,
) -> tuple[SpecRow, int] | None:
    """Порядок Tekla Structures: позиция [марка] кол-во профиль длина_мм массы сталь [RAL…]."""
    n = len(lines)
    pos = lines[pos_index]
    if not re.match(r"^\d{1,4}$", pos):
        return None
    j = pos_index + 1
    if j >= n:
        return None
    row_assembly = last_mark
    if _is_tekla_mark_cell(lines[j]):
        row_assembly = _normalize_assembly_mark(lines[j])
        j += 1
        if j >= n:
            return None
    if not re.match(r"^\d{1,3}$", lines[j]):
        return None
    qty = int(lines[j])
    j += 1
    if j >= n:
        return None
    profile_raw = _clean_profile_cell(lines[j])
    if not _looks_like_profile_tekla(profile_raw):
        return None
    j += 1
    if j >= n:
        return None
    len_tok = lines[j].strip().replace(",", ".")
    if not re.match(r"^\d{2,5}(?:\.\d+)?$", len_tok):
        return None
    length_mm = float(len_tok)
    if length_mm < 3 or length_mm > 52000:
        return None
    j += 1
    raw_m: list[float] = []
    while j < n and len(raw_m) < 2 and re.match(r"^\d+[.,]?\d*$", lines[j].replace(" ", "")):
        raw = lines[j].replace(" ", "").replace(",", ".")
        try:
            raw_m.append(float(raw))
        except ValueError:
            break
        j += 1
    if len(raw_m) < 1:
        return None
    mu: float | None = None
    mt: float | None = None
    if len(raw_m) == 2:
        mu, mt = _masses_from_pdf_pair(raw_m[0], raw_m[1], qty)
    else:
        mu = mt = raw_m[0]
    if j >= n:
        return None
    steel = lines[j].strip()
    if not _RE_STEEL.match(steel) and not re.match(r"^C\d", steel, re.I):
        return None
    j += 1
    note_parts: list[str] = []
    while j < n and re.match(r"^RAL\d+", lines[j], re.I):
        note_parts.append(lines[j].strip())
        j += 1
    assembly_mark = row_assembly.strip() or (mark_hint_from_basename(basename_hint or "") or "")
    if not assembly_mark:
        assembly_mark = fallback_mark
    triple_note: list[str] = []
    pk, triple_prof = plate_profile_catalog_key_pref(profile_raw)
    if triple_prof is not None:
        tol_l = _triple_plate_length_tol_mm(length_mm)
        if abs(float(triple_prof.ell_mm) - float(length_mm)) > tol_l:
            triple_note.append(
                f"сеч:Lsect={int(triple_prof.ell_mm)}≠Lтаб={int(round(length_mm))}мм"
            )
    fragments = [*note_parts, *triple_note]
    note = "; ".join([x for x in fragments if x])
    if pk is None:
        nk = _normalize_profile_key(profile_raw)
        if nk and not re.fullmatch(r"\d{1,6}", nk):
            pk = nk
    row = SpecRow(
        position=pos,
        qty=qty,
        length_mm=length_mm,
        profile_raw=profile_raw,
        profile_key=pk,
        steel=steel,
        assembly_mark=assembly_mark,
        note=note,
        mass_kg_unit=mu,
        mass_kg_total=mt,
    )
    return row, j


def extract_spec_block(text: str) -> str | None:
    m = _RE_SPEC_ANCHOR.search(text)
    if not m:
        return None
    start = m.end()
    tail = text[start:]
    em = _RE_SPEC_END.search(tail)
    end = em.start() if em else len(tail)
    return tail[:end].strip()


def diagnose_global_spec_tail_open(full_text: str) -> tuple[bool, int]:
    """True, если после первого якоря BOM нет границы «наплав» до очень большого хвоста."""
    if not full_text.strip():
        return False, 0
    first = _RE_SPEC_ANCHOR.search(full_text)
    if not first:
        return False, 0
    tail = full_text[first.end() :]
    em = _RE_SPEC_END.search(tail)
    if em:
        return False, len(tail)
    return len(tail) > 12000, len(tail)


def build_segmented_bom_joint_text(pages_text: list[str]) -> tuple[str, list[int]]:
    """
    Склеенный КМД: по каждой странице свой extract_spec_block (наплав на этой же странице обрезает хвост),
    блоки объединяются через разделитель. Возвращает (текст для extract_spec_rows, индексы страниц с BOM).
    """
    sep = "\n\n<<<PTO_PAGE_BREAK>>>\n\n"
    parts: list[str] = []
    idxs: list[int] = []
    for i, pg in enumerate(pages_text):
        block = extract_spec_block(pg or "")
        if not block or len(block.strip()) < 40:
            continue
        parts.append(block.strip())
        idxs.append(i)
    if not parts:
        return "", []
    return sep.join(parts), idxs


def dedupe_spec_rows(rows: list[SpecRow]) -> list[SpecRow]:
    """Схлопывание повторов при склейке нескольких листов одной маркой."""
    best: dict[tuple[Any, ...], SpecRow] = {}
    for r in rows:
        pk = _normalize_profile_key(r.profile_raw) or ""
        key = (
            (r.assembly_mark or "").strip(),
            str(r.position).strip(),
            round(float(r.length_mm), 3),
            int(r.qty),
            pk,
        )
        prev = best.get(key)
        if prev is None:
            best[key] = r
            continue
        if r.mass_kg_total is not None and prev.mass_kg_total is None:
            best[key] = r
            continue
        if prev.mass_kg_total is not None and r.mass_kg_total is None:
            continue
        if (r.catalog_m2_per_m or 0) > 0 and (prev.catalog_m2_per_m or 0) <= 0:
            best[key] = r
    return list(best.values())


def _parse_layout_qty_cell(s: str | None) -> int | None:
    if not (s and str(s).strip()):
        return None
    t = re.sub(r"\s+", "", str(s).strip())
    m = re.match(r"^(\d{1,4})$", t)
    return int(m.group(1)) if m else None


def _bom_layout_mass_float(raw: str | None) -> float | None:
    if not (raw and raw.strip()):
        return None
    t = raw.replace(" ", "").replace(",", ".")
    try:
        v = float(t)
    except ValueError:
        return None
    if v < 0 or v > 2e7:
        return None
    return v


def _layout_row_parse_confidence(
    *,
    has_section: bool,
    has_length: bool,
    has_steel: bool,
    has_mass_ok: bool,
    triple_aligned: bool,
    page_quality: float,
) -> float:
    sc = float(page_quality or 0) * 0.35 + 0.12
    if has_section:
        sc += 0.18
    if has_length:
        sc += 0.12
    if has_steel:
        sc += 0.1
    if has_mass_ok:
        sc += 0.12
    if triple_aligned:
        sc += 0.08
    return float(max(0.05, min(0.995, sc)))


def spec_row_from_bom_layout_cells(
    cells_map: dict[str, str],
    *,
    last_mark_carry: str,
    fallback_mark: str,
    basename_hint: str | None,
    page_quality: float,
    layout_roles_used: tuple[str, ...],
) -> tuple[SpecRow | None, float, str]:
    """
    Одна строка таблицы по ролям ячеек (из pdf_table_layout).
    Возвращает (строка | None, уверенность, новый_last_mark_carry).
    """
    # Локальный импорт: избежать циклических зависимостей при альтернативных точках входа.
    from pdf_table_layout import (
        ROLE_ASSEMBLY_MARK,
        ROLE_ELEMENT_MASS,
        ROLE_LENGTH,
        ROLE_MASS_SINGLE,
        ROLE_MASS_TOTAL,
        ROLE_POSITION,
        ROLE_QTY,
        ROLE_SECTION,
        ROLE_STEEL,
    )

    _ = layout_roles_used

    pos = str(cells_map.get(ROLE_POSITION) or "").strip()
    if not re.match(r"^\d{1,4}$", pos):
        return None, 0.0, last_mark_carry

    qty = _parse_layout_qty_cell(cells_map.get(ROLE_QTY)) or 1

    raw_am = str(cells_map.get(ROLE_ASSEMBLY_MARK) or "").strip()
    if _is_tekla_mark_cell(raw_am):
        mark_carry = _normalize_assembly_mark(raw_am)
        mark_base = mark_carry
    else:
        mark_carry = last_mark_carry
        mark_base = last_mark_carry

    raw_sec = _clean_profile_cell(str(cells_map.get(ROLE_SECTION) or "").strip())
    if not raw_sec or not (_looks_like_gost_section_cell(raw_sec) or _looks_like_profile_tekla(raw_sec)):
        return None, 0.0, last_mark_carry

    len_tok = cells_map.get(ROLE_LENGTH)
    lm = None
    if len_tok and str(len_tok).strip():
        lm = _token_bom_length_mm(str(len_tok).strip())
    if lm is None:
        return None, 0.0, mark_carry

    steel_raw = str(cells_map.get(ROLE_STEEL) or "").strip()
    if not steel_raw or (not bool(_RE_STEEL.match(steel_raw)) and not re.match(r"^C\d", steel_raw, re.I)):
        return None, 0.0, mark_carry

    ms = _bom_layout_mass_float(cells_map.get(ROLE_MASS_SINGLE))
    mt = _bom_layout_mass_float(cells_map.get(ROLE_MASS_TOTAL))
    me = _bom_layout_mass_float(cells_map.get(ROLE_ELEMENT_MASS))
    mu: float | None = None
    mtot: float | None = None
    if ms is not None and mt is not None:
        mu, mtot = _masses_from_pdf_pair(ms, mt, qty)
    elif ms is not None:
        mu = mtot = ms
    elif mt is not None:
        mu = mtot = mt
    elif me is not None:
        mu = mtot = me

    triple_v = parse_plate_t_triple_mm(_unify_profile_chars(_clean_profile_cell(raw_sec)))
    triple_ok = bool(triple_v) and triple_length_matches_table_mm(triple_v, float(lm))

    conf = _layout_row_parse_confidence(
        has_section=True,
        has_length=True,
        has_steel=True,
        has_mass_ok=mu is not None and mtot is not None,
        triple_aligned=triple_ok,
        page_quality=page_quality,
    )

    row, _k = _finalize_kmd_material_row_tail(
        pos,
        raw_sec,
        int(qty),
        float(lm),
        steel_raw,
        mu=mu,
        mt=mtot,
        assembly_mark_base=mark_base,
        fallback_mark=fallback_mark,
        basename_hint=basename_hint,
        note_fragments=[],
        j_notes=0,
        lines=[],
    )
    row.row_source = "spatial"
    row.layout_confidence = conf
    return row, conf, mark_carry


def spec_rows_from_layout_pages(
    doc: Any,
    page_indices: list[int],
    basename_hint: str | None,
    *,
    fallback_mark: str | None = None,
) -> tuple[list[SpecRow], dict[str, Any]]:
    """
    Сбор строк ведомости по геометрии текста страниц bom (PyMuPDF).
    """
    from pdf_table_layout import extract_bom_layout_from_page

    fb = (fallback_mark or "").strip() or "Без марки в тексте"
    last = (mark_hint_from_basename(basename_hint) if basename_hint else "") or ""
    out: list[SpecRow] = []
    diag: dict[str, Any] = {"pages_tried": list(page_indices), "per_page": [], "rows_total": 0, "avg_confidence": 0.0}
    confs: list[float] = []

    if doc is None or not page_indices:
        return out, diag

    try:
        n_doc = len(doc)
    except TypeError:
        n_doc = 0

    for pi in page_indices:
        if not isinstance(pi, int) or pi < 0 or (n_doc and pi >= n_doc):
            continue
        try:
            page = doc[pi]
        except (IndexError, RuntimeError):
            continue
        ex = extract_bom_layout_from_page(page)
        roles_tuple = tuple(str(x) for x in ex.col_roles if x)
        for m in ex.rows_data:
            row, conf, last = spec_row_from_bom_layout_cells(
                m,
                last_mark_carry=last,
                fallback_mark=fb,
                basename_hint=basename_hint,
                page_quality=ex.page_quality,
                layout_roles_used=roles_tuple,
            )
            if row is not None:
                out.append(row)
                confs.append(conf)
        diag["per_page"].append(
            {
                "page": pi,
                "rows_extracted_raw": len(ex.rows_data),
                "page_quality": ex.page_quality,
                "debug": ex.debug_note,
                "header_line": ex.header_line_index,
            }
        )

    diag["rows_total"] = len(out)
    diag["avg_confidence"] = float(sum(confs) / len(confs)) if confs else 0.0
    return out, diag


def spec_rows_from_llm_json_rows(items: Any, basename_hint: str | None) -> list[SpecRow]:
    """
    Преобразует массив объектов из ответа LLM (bom_material_rows) в SpecRow.
    Ожидаемые поля: position, qty, section|profile, length_mm, steel|grade,
    mass_unit|mass_kg_unit, mass_total|mass_kg_total, assembly_mark (опц.).
    """
    if not isinstance(items, list) or not items:
        return []
    last = (mark_hint_from_basename(basename_hint) if basename_hint else "") or ""
    fb = "Без марки в тексте"
    out: list[SpecRow] = []

    for it in items:
        if not isinstance(it, dict):
            continue
        pos = str(it.get("position") or it.get("pos") or "").strip()
        if not re.match(r"^\d{1,4}$", pos):
            continue
        qraw = it.get("qty")
        try:
            qty = int(qraw) if qraw is not None else 1
        except (TypeError, ValueError):
            qty = _parse_layout_qty_cell(str(qraw)) or 1
        qty = max(1, min(5000, qty))

        raw_am = str(it.get("assembly_mark") or it.get("mark") or "").strip()
        if _is_tekla_mark_cell(raw_am):
            last = _normalize_assembly_mark(raw_am)
            mark_base = last
        else:
            mark_base = last

        raw_sec = _clean_profile_cell(str(it.get("section") or it.get("profile") or "").strip())
        if not raw_sec or not (_looks_like_gost_section_cell(raw_sec) or _looks_like_profile_tekla(raw_sec)):
            continue
        lm_any = it.get("length_mm", it.get("length"))
        lm: float | None = None
        if lm_any is not None:
            try:
                lm = float(str(lm_any).replace(",", ".").replace(" ", ""))
            except ValueError:
                lm = None
        if lm is None:
            lm = _token_bom_length_mm(str(it.get("length") or ""))
        if lm is None:
            continue

        steel_raw = str(it.get("steel") or it.get("grade") or "").strip()
        if not steel_raw or (not bool(_RE_STEEL.match(steel_raw)) and not re.match(r"^C\d", steel_raw, re.I)):
            continue

        def _flt(k1: str, k2: str) -> float | None:
            for k in (k1, k2):
                v = it.get(k)
                if v is None:
                    continue
                try:
                    return float(str(v).replace(",", ".").replace(" ", ""))
                except ValueError:
                    continue
            return None

        ms = _flt("mass_unit", "mass_kg_unit")
        mt = _flt("mass_total", "mass_kg_total")
        mu: float | None = None
        mtot: float | None = None
        if ms is not None and mt is not None:
            mu, mtot = _masses_from_pdf_pair(ms, mt, qty)
        elif ms is not None:
            mu = mtot = ms
        elif mt is not None:
            mu = mtot = mt

        row, _ = _finalize_kmd_material_row_tail(
            pos,
            raw_sec,
            int(qty),
            float(lm),
            steel_raw,
            mu=mu,
            mt=mtot,
            assembly_mark_base=mark_base,
            fallback_mark=fb,
            basename_hint=basename_hint,
            note_fragments=[],
            j_notes=0,
            lines=[],
        )
        row.row_source = "llm_json"
        row.layout_confidence = 0.55
        out.append(row)
    return out


def extract_spec_rows(text: str, basename_hint: str | None = None, *, presegmented_joint: bool = False) -> list[SpecRow]:
    """
    Эвристика под шаблон: после заголовков идут строки
    поз, к-во, (марка или длина мм), сталь, профиль, масса шт, масса всего.
    Марка сборки наследуется по таблице; при отсутствии — подсказка из имени файла.

    presegmented_joint: text уже несколько блоков BOM (разделитель <<<PTO_PAGE_BREAK>>> между листами),
    без общего якоря в начале — разбор всего текста как одной виртуальной таблицы.
    """
    if presegmented_joint:
        raw = (text or "").strip()
        if not raw:
            return []
        block = re.sub(r"\s*<<<PTO_PAGE_BREAK>>>\s*", "\n\n", raw).strip()
    else:
        block = extract_spec_block(text)
        if not block:
            return []
    last_mark = (mark_hint_from_basename(basename_hint) if basename_hint else "") or ""
    fallback_mark = "Без марки в тексте"
    lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
    # Убрать строки-заголовки таблицы сразу после якоря
    skip_tokens = {
        "name",
        "pos",
        "q-ty",
        "pcs",
        "lenght",
        "mm",
        "per unit",
        "all unit",
        "mark",
        "steel",
        "grade",
        "remark",
        "наименование",
        "марка",
        "стали",
        "примечание",
        "длина",
        "масса",
        "кг",
            "сечение",
        "профиль",
        "дет.",
        "общ.",
        "обозначение",
        "позиция",
        "поз.",
        "эл-та",
        "сортамент",
        "дет. кол.",
        "марки",
    }
    i = 0
    while i < len(lines):
        low = re.sub(r"[,.\d]", "", lines[i]).strip().lower()
        if lines[i].lower() in skip_tokens or (len(lines[i]) < 12 and lines[i].lower() in skip_tokens):
            i += 1
            continue
        # пропуск коротких служебных
        if len(lines[i]) <= 2 and lines[i].isalpha():
            i += 1
            continue
        break
    rows: list[SpecRow] = []
    n = len(lines)
    while i < n:
        # позиция: число 1–4 цифры
        if not re.match(r"^\d{1,4}$", lines[i]):
            i += 1
            continue
        pos_line_idx = i
        tr = _try_extract_tekla_row(lines, pos_line_idx, last_mark, fallback_mark, basename_hint)
        if tr is not None:
            row, next_i = tr
            rows.append(row)
            am = row.assembly_mark
            if am and am != fallback_mark:
                last_mark = am
            i = next_i
            continue
        gr = _try_extract_gost_kmd_row(lines, pos_line_idx, last_mark, fallback_mark, basename_hint)
        if gr is not None:
            row, next_i = gr
            rows.append(row)
            am = row.assembly_mark
            if am and am != fallback_mark:
                last_mark = am
            i = next_i
            continue
        lr_row = _try_extract_length_then_section_row(
            lines, pos_line_idx, last_mark, fallback_mark, basename_hint
        )
        if lr_row is not None:
            row, next_i = lr_row
            rows.append(row)
            am = row.assembly_mark
            if am and am != fallback_mark:
                last_mark = am
            i = next_i
            continue
        pos = lines[pos_line_idx]
        i = pos_line_idx + 1
        if i >= n:
            break
        if not re.match(r"^\d{1,3}$", lines[i]):
            i = pos_line_idx + 1
            continue
        qty = int(lines[i])
        i += 1
        if i >= n:
            break
        mark: str | None = None
        length_mm: float
        token = lines[i]
        if re.match(r"^\d{3,5}$", token) and int(token) >= 100:
            length_mm = float(token)
            i += 1
        else:
            mark = token
            i += 1
            if i >= n or not re.match(r"^\d{3,5}$", lines[i]):
                continue
            length_mm = float(lines[i])
            i += 1
        if i >= n:
            break
        steel = lines[i]
        if not _RE_STEEL.match(steel) and not re.match(r"^C\d", steel, re.I):
            # иногда порядок сдвинут — пропуск строки
            i += 1
            if i >= n:
                break
            steel = lines[i]
        i += 1
        if i >= n:
            break
        profile_raw = _clean_profile_cell(lines[i])
        i += 1
        pk, triple_g = plate_profile_catalog_key_pref(profile_raw)
        triple_warn = ""
        if triple_g is not None and length_mm > 0:
            tol_l = _triple_plate_length_tol_mm(length_mm)
            if abs(float(triple_g.ell_mm) - float(length_mm)) > tol_l:
                triple_warn = f"сеч:Lsect={int(triple_g.ell_mm)}≠Lтаб={int(round(length_mm))}мм"
        if pk is None:
            nk = _normalize_profile_key(profile_raw)
            if nk and not re.fullmatch(r"\d{1,6}", nk):
                pk = nk
        if mark:
            last_mark = _normalize_assembly_mark(mark)
        assembly_mark = last_mark if last_mark else fallback_mark
        note = f"марка {mark}" if mark else ""
        if triple_warn:
            note = f"{note}; {triple_warn}".strip("; ") if note else triple_warn
        raw_m: list[float] = []
        while i < n and len(raw_m) < 2 and re.match(r"^\d+[.,]?\d*$", lines[i].replace(" ", "")):
            raw = lines[i].replace(" ", "").replace(",", ".")
            try:
                raw_m.append(float(raw))
            except ValueError:
                break
            i += 1
        mu: float | None = None
        mt: float | None = None
        if len(raw_m) == 2:
            mu, mt = _masses_from_pdf_pair(raw_m[0], raw_m[1], qty)
        elif len(raw_m) == 1:
            mu = mt = raw_m[0]
        rows.append(
            SpecRow(
                position=pos,
                qty=qty,
                length_mm=length_mm,
                profile_raw=profile_raw,
                profile_key=pk,
                steel=steel,
                assembly_mark=assembly_mark,
                note=note,
                mass_kg_unit=mu,
                mass_kg_total=mt,
            )
        )
    return rows


def _slug_variants(sk: str) -> list[str]:
    if not sk:
        return []
    s = {sk}
    if "a" in sk:
        s.add(sk.replace("a", "а"))
    if "e" in sk:
        s.add(sk.replace("e", "е"))
    return list(s)


def _rolled_section_slug_variants(slug: str) -> list[str]:
    """Суффикс после типового префикса проката в slug (двутавр40к2 → 40к2 для подбора в CSV)."""
    if not slug or len(slug) < 5:
        return []
    s = slug.lower().strip()
    out: list[str] = []
    prefixes = (
        "двутавр",
        "швеллер",
        "швеллеро",
        "уголокравнополочный",
        "равнополочныйуголок",
        "уголок",
        "тавртавр",
        "тавр",
        "балка",
        "сварнаябалка",
    )
    for p in prefixes:
        if s.startswith(p) and len(s) > len(p) + 2:
            suf = s[len(p) :]
            if suf and suf not in out:
                out.append(suf)
    return out


def _catalog_slug_fallback_match(
    row_slug: str,
    catalog_m2: dict[str, float],
    cat_k: dict[str, float],
    *,
    mass_kg_total: float | None = None,
    length_mm: float = 0.0,
    qty: int = 1,
) -> tuple[float | None, float | None]:
    """
    Если в ведомости короткое обозначение (40к2), а в CSV длинный ключ (двутавр40к2),
    или наоборот — подобрать коэффициент по совпадению slug с конца (суффикс/префикс).
    Минимальная длина 3, чтобы не цеплять случайные числа.
    """
    if not row_slug or len(row_slug) < 3:
        return None, None
    candidates: list[str] = []
    for ck in catalog_m2:
        if ck == row_slug:
            continue
        ok = False
        if len(ck) >= len(row_slug) and ck.endswith(row_slug):
            ok = True
        elif len(row_slug) >= len(ck) and row_slug.endswith(ck):
            ok = True
        elif (
            len(row_slug) >= 4
            and len(ck) >= 5
            and row_slug in ck
        ):
            ok = True
        elif (
            len(ck) >= 4
            and len(row_slug) >= 5
            and ck in row_slug
        ):
            ok = True
        if ok:
            candidates.append(ck)
    if not candidates:
        return None, None
    dlen = (length_mm / 1000.0) * max(1, qty)
    if mass_kg_total is not None and dlen > 1e-9 and cat_k:
        kg_obs = float(mass_kg_total) / dlen
        best: tuple[str, float, float, float] | None = None
        for ck in candidates:
            kpm_c = cat_k.get(ck)
            mpm_c = catalog_m2.get(ck)
            if kpm_c is None or mpm_c is None or kpm_c < 1e-9:
                continue
            ref = max(abs(kg_obs), abs(kpm_c), 1.0)
            err = abs(kpm_c - kg_obs) / ref
            if err > 0.38:
                continue
            if best is None or err < best[3]:
                best = (ck, mpm_c, kpm_c, err)
        if best is not None:
            return best[1], best[2]
    best_k = max(candidates, key=len)
    mpm = catalog_m2.get(best_k)
    kpm = cat_k.get(best_k) if cat_k else None
    return mpm, kpm


def reconcile_catalog_with_bom(
    rows: list[SpecRow],
    *,
    tolerance_pct: float = 2.0,
    abs_kg_tol: float = 0.05,
) -> None:
    """
    Подгонка кг/м и м²/м под массу и длину ведомости при сохранении отношения м²/кг из каталога.
    Масса строки: приоритет «кг Σ»; если в PDF её нет — кг/шт×qty. Подгонка выполняется всегда,
    даже если кг/шт и кг Σ в тексте расходятся (для кг/м берём Σ, а предупреждение даёт validate).
    """
    kg_floor = max(abs_kg_tol, 0.01)
    for r in rows:
        if r.catalog_m2_per_m is None:
            continue
        if r.length_mm <= 0 or r.qty <= 0:
            continue
        denom = (r.length_mm / 1000.0) * r.qty
        if denom <= 1e-9:
            continue
        mt = r.mass_kg_total
        mu = r.mass_kg_unit
        mt_ref: float | None = None
        if mt is not None and float(mt) > 1e-6:
            mt_ref = float(mt)
        elif mu is not None:
            mt_ref = float(mu) * max(1, r.qty)
        if mt_ref is None or mt_ref <= 1e-6:
            continue
        kgpm_bom = mt_ref / denom
        mpm = float(r.catalog_m2_per_m)
        kpm = r.catalog_kg_per_m
        if kpm is not None and float(kpm) > 1e-9:
            fkpm = float(kpm)
            if within_tolerance(kgpm_bom, fkpm, tolerance_pct, kg_floor):
                r.catalog_kg_per_m = round(kgpm_bom, 6)
                r.catalog_m2_per_m = round(mpm, 6)
            else:
                ratio = mpm / fkpm
                r.catalog_kg_per_m = round(kgpm_bom, 6)
                r.catalog_m2_per_m = round(kgpm_bom * ratio, 6)
        else:
            r.catalog_kg_per_m = round(kgpm_bom, 6)
        r.area_m2 = float(r.catalog_m2_per_m) * denom


def _bom_kgpm_matches_catalog_entry(
    kg_obs_bom: float | None,
    kg_cat: float | None,
    *,
    rel_pct: float = 10.0,
    abs_kg_floor: float = 0.08,
) -> bool:
    """Не брать нечёткий ключ каталога, если кг/м ведомости сильно расходится с кг/м строки CSV."""
    if kg_obs_bom is None:
        return True
    if kg_cat is None or float(kg_cat) < 1e-9:
        return True
    kc = float(kg_cat)
    d = abs(kg_obs_bom - kc)
    ref = max(abs(kg_obs_bom), abs(kc), 1e-9)
    if d <= abs_kg_floor:
        return True
    return (d / ref) <= (rel_pct / 100.0)


def apply_catalog(
    rows: list[SpecRow],
    catalog_m2: dict[str, float],
    catalog_kg: dict[str, float] | None = None,
) -> tuple[list[SpecRow], int, int]:
    """Заполняет catalog_m2_per_m, catalog_kg_per_m и area_m2. Возвращает (rows, совпало_m2, всего с профилем)."""
    cat_k = catalog_kg or {}
    with_key = 0
    matched = 0
    for r in rows:
        prof_raw = _fix_ocr_digit_confusables((r.profile_raw or "").strip())
        has_prof = bool((r.profile_key or "").strip() or (r.profile_raw or "").strip())
        dlen_bom = (r.length_mm / 1000.0) * max(1, r.qty)
        kg_obs_bom: float | None = (
            float(r.mass_kg_total) / dlen_bom if (dlen_bom > 1e-9 and r.mass_kg_total is not None) else None
        )
        keys_try: list[str] = []
        tk_pref, _ = plate_profile_catalog_key_pref(prof_raw)
        if tk_pref:
            keys_try.append(tk_pref)
        if r.profile_key:
            keys_try.append(r.profile_key)
        nk = _normalize_profile_key(prof_raw)
        if nk:
            keys_try.append(nk)
        wxh_list = _all_wxh_keys_from_text(prof_raw)
        if len(wxh_list) == 1:
            parts = wxh_list[0].lower().replace("х", "x").split("x")
            if len(parts) == 2:
                try:
                    a0, b0 = int(parts[0]), int(parts[1])
                    Bc, tc = _canonical_plate_width_thickness_mm(a0, b0)
                    if f"{Bc}x{tc}".lower() != wxh_list[0].lower():
                        keys_try.append(f"{Bc}x{tc}")
                except ValueError:
                    pass
        for wxh in wxh_list:
            keys_try.append(wxh)
        sk = _slug_catalog_key(prof_raw)
        if sk:
            keys_try.extend(_slug_variants(sk))
            for gt in _gost_slug_tokens(sk):
                keys_try.append(gt)
                keys_try.extend(_slug_variants(gt))
            for suf in _rolled_section_slug_variants(sk):
                keys_try.append(suf)
                keys_try.extend(_slug_variants(suf))
                for gt in _gost_slug_tokens(suf):
                    keys_try.append(gt)
                    keys_try.extend(_slug_variants(gt))
        cand_keys: list[str] = []
        seen_c: set[str] = set()
        for k in keys_try:
            if not k:
                continue
            for cand in _slug_variants(k.lower()):
                if cand not in seen_c:
                    seen_c.add(cand)
                    cand_keys.append(cand)
        mpm: float | None = None
        kpm: float | None = None
        # Если в ячейке несколько B×t и есть масса в ведомости — выбрать сечение по ближайшему кг/м из каталога
        if len(wxh_list) > 1 and r.mass_kg_total is not None and cat_k:
            dlen = (r.length_mm / 1000.0) * max(1, r.qty)
            if dlen > 1e-9:
                kg_obs = r.mass_kg_total / dlen
                best: tuple[float, float, float] | None = None
                for wxh in wxh_list:
                    for cand in _slug_variants(wxh.lower()):
                        kpm_c = cat_k.get(cand)
                        mpm_c = catalog_m2.get(cand)
                        if kpm_c is None or mpm_c is None or kpm_c < 1e-9:
                            continue
                        ref = max(abs(kg_obs), abs(kpm_c), 1.0)
                        err = abs(kpm_c - kg_obs) / ref
                        if err <= 0.18 and (best is None or err < best[0]):
                            best = (err, mpm_c, kpm_c)
                if best is not None:
                    mpm = best[1]
                    kpm = best[2]
        if mpm is None or kpm is None:
            for cand in cand_keys:
                if mpm is None and cand in catalog_m2:
                    mpm = catalog_m2[cand]
                if kpm is None and cand in cat_k:
                    kpm = cat_k[cand]
                if mpm is not None and kpm is not None:
                    break
        if mpm is None:
            for cand in cand_keys:
                if cand in catalog_m2:
                    mpm = catalog_m2[cand]
                    break
        if kpm is None:
            for cand in cand_keys:
                if cand in cat_k:
                    kpm = cat_k[cand]
                    break
        if mpm is None:
            swap_keys: list[str] = []
            seen_sw: set[str] = set()
            for src in [x for x in (r.profile_key, nk) if x] + wxh_list:
                for sv in _swapped_wxh_variants(src):
                    if sv not in seen_sw:
                        seen_sw.add(sv)
                        swap_keys.append(sv)
            for cand in swap_keys:
                if cand in catalog_m2 and mpm is None:
                    mpm = catalog_m2[cand]
                if cand in cat_k and kpm is None:
                    kpm = cat_k[cand]
        if mpm is None and sk:
            fm2, fkg = _catalog_slug_fallback_match(
                sk,
                catalog_m2,
                cat_k,
                mass_kg_total=r.mass_kg_total,
                length_mm=float(r.length_mm),
                qty=int(r.qty),
            )
            if fm2 is not None and _bom_kgpm_matches_catalog_entry(kg_obs_bom, fkg):
                mpm = fm2
                if fkg is not None:
                    kpm = fkg
        if mpm is None and sk:
            for gt in _gost_slug_tokens(sk):
                fm2, fkg = _catalog_slug_fallback_match(
                    gt,
                    catalog_m2,
                    cat_k,
                    mass_kg_total=r.mass_kg_total,
                    length_mm=float(r.length_mm),
                    qty=int(r.qty),
                )
                if fm2 is not None and _bom_kgpm_matches_catalog_entry(kg_obs_bom, fkg):
                    mpm = fm2
                    if fkg is not None:
                        kpm = fkg
                    break
        if mpm is None and wxh_list:
            picked = _pick_plate_wxh_for_fallback(wxh_list, r.mass_kg_total, r.length_mm, r.qty)
            if picked is not None:
                pw, pt = picked
                mpm = _estimate_plate_m2_per_m(pw, pt)
                kpm = _plate_kg_per_m(pw, pt)
                _append_row_note(r, f"оценка листа {pw}×{pt} (нет в CSV)")
        if mpm is None and cat_k and kg_obs_bom is not None:
            m2g, k2g, ckg = _catalog_pick_by_bom_kg_per_m(kg_obs_bom, catalog_m2, cat_k)
            if m2g is not None:
                mpm = m2g
                if k2g is not None:
                    kpm = k2g
                _append_row_note(r, f"подбор по кг/м из ведомости → «{ckg}»")
        if mpm is None and sk and len(sk) >= 4:
            lk = _longest_catalog_key_containing_slug(sk, catalog_m2)
            lk_k = float(cat_k[lk]) if (lk and lk in cat_k) else None
            if lk and lk in catalog_m2 and _bom_kgpm_matches_catalog_entry(kg_obs_bom, lk_k):
                mpm = catalog_m2[lk]
                if kpm is None and lk in cat_k:
                    kpm = cat_k[lk]
                _append_row_note(r, f"совпадение по каталогу «{lk}»")
        if mpm is None and sk:
            rk = _nearest_rolled_catalog_key(sk, catalog_m2)
            rk_k = float(cat_k[rk]) if (rk and rk in cat_k) else None
            if rk and rk in catalog_m2 and _bom_kgpm_matches_catalog_entry(kg_obs_bom, rk_k):
                mpm = catalog_m2[rk]
                if kpm is None and rk in cat_k:
                    kpm = cat_k[rk]
                _append_row_note(r, f"ближайший типоразмер в CSV: «{rk}»")
        if mpm is None and sk and len(sk) >= 4:
            fk = _fuzzy_best_catalog_key(sk, catalog_m2, min_ratio=0.70)
            fk_k = float(cat_k[fk]) if (fk and fk in cat_k) else None
            if fk and fk in catalog_m2 and _bom_kgpm_matches_catalog_entry(kg_obs_bom, fk_k):
                mpm = catalog_m2[fk]
                if kpm is None and fk in cat_k:
                    kpm = cat_k[fk]
                _append_row_note(r, f"нестрогое сопоставление с «{fk}»")
        if mpm is None:
            dim_hint = nk or r.profile_key or (wxh_list[0] if wxh_list else "") or prof_raw
            dk = _dim_neighbor_catalog_key(str(dim_hint or ""), catalog_m2)
            dk_k = float(cat_k[dk]) if (dk and dk in cat_k) else None
            if dk and dk in catalog_m2 and _bom_kgpm_matches_catalog_entry(kg_obs_bom, dk_k):
                mpm = catalog_m2[dk]
                if kpm is None and dk in cat_k:
                    kpm = cat_k[dk]
                _append_row_note(r, f"ближайший размер листа в CSV: «{dk}»")
        if mpm is None and sk and len(sk) >= 4:
            sk2 = _fuzzy_catalog_key_substring(sk, catalog_m2, min_ratio=0.50)
            sk2_k = float(cat_k[sk2]) if (sk2 and sk2 in cat_k) else None
            if sk2 and sk2 in catalog_m2 and _bom_kgpm_matches_catalog_entry(kg_obs_bom, sk2_k):
                mpm = catalog_m2[sk2]
                if kpm is None and sk2 in cat_k:
                    kpm = cat_k[sk2]
                _append_row_note(r, f"подбор по части обозначения → «{sk2}»")
        if mpm is None and has_prof and kg_obs_bom is not None:
            mpm = _heuristic_m2pm_from_kgpm(kg_obs_bom)
            if kpm is None:
                kpm = round(kg_obs_bom, 4)
            _append_row_note(
                r,
                "оценка м²/м по массе ведомости (точный ключ не найден — при необходимости сверьте CSV)",
            )
        if mpm is None and has_prof and catalog_m2 and kg_obs_bom is None:
            mpm = _fallback_median_m2(catalog_m2)
            _append_row_note(
                r,
                "м²/м взято по медиане каталога: профиль не сопоставлен; при необходимости дополните CSV",
            )
        if mpm is None and has_prof:
            mpm = 1.0
            _append_row_note(r, "м²/м = 1 — нет каталога/массы; замените коэффициент вручную")
        if mpm is not None and has_prof:
            matched += 1
        if r.profile_key or r.profile_raw.strip():
            with_key += 1
        r.catalog_m2_per_m = mpm
        r.catalog_kg_per_m = kpm
        if mpm is not None:
            r.area_m2 = mpm * (r.length_mm / 1000.0) * r.qty
        else:
            r.area_m2 = 0.0
    return rows, matched, with_key


_PROFILE_RAW_CANON_MAX = 220
_RE_HINT_PLATE_PAIR = re.compile(r"^\s*(\d{1,5})\s*x\s*(\d{1,5})\s*$", re.I)


def profile_raw_canonical_key(profile_raw: str) -> str:
    """Нормализованный ключ ячейки профиля (кеш LLM и подсказки)."""
    return _unify_profile_chars(_clean_profile_cell(profile_raw)).strip().lower()[:_PROFILE_RAW_CANON_MAX]


def sanitize_llm_profile_key_hint(s: str) -> str | None:
    """Допускаем только безопасные ключи вида B×t или типоразмера ГОСТ (короткий slug)."""
    t = _unify_profile_chars((s or "").strip()).lower().replace("х", "x").replace(" ", "")
    if not t or len(t) > 26:
        return None
    m = _RE_HINT_PLATE_PAIR.match(t.replace("×", "x"))
    if m:
        B, tm = _canonical_plate_width_thickness_mm(int(m.group(1)), int(m.group(2)))
        return f"{B}x{tm}"
    sl = _slug_catalog_key(_unify_profile_chars(s))
    if 3 <= len(sl) <= 16 and (_RE_ROLLED_SIZING_TOKEN.match(sl) or re.fullmatch(r"\d{1,5}x\d{1,3}", sl)):
        if "x" in sl:
            a, _, b = sl.partition("x")
            try:
                B, tm = _canonical_plate_width_thickness_mm(int(a), int(b))
                return f"{B}x{tm}"
            except ValueError:
                pass
            return None
        return sl
    return None


def apply_profile_llm_hints_to_rows(
    rows: list[SpecRow],
    hints_raw_to_key: dict[str, str],
    catalog_m2: dict[str, float],
    catalog_kg: dict[str, float] | None = None,
) -> int:
    """
    Одна дорожка после apply_catalog: подставляет ключ профиля из LLM только если в каталоге есть м²/м.
    Не меняет area_m2 из полей модели — только из CSV.
    """
    if not hints_raw_to_key:
        return 0
    cat_k = catalog_kg or {}
    touched = 0
    for r in rows:
        if r.catalog_m2_per_m is not None:
            continue
        canon = profile_raw_canonical_key(r.profile_raw)
        hk0 = hints_raw_to_key.get(canon)
        if not hk0:
            continue
        hk = sanitize_llm_profile_key_hint(hk0)
        if not hk:
            continue
        mpm_c: float | None = None
        kpm_r: float | None = None
        cat_hit = ""
        for cand in _slug_variants(hk.lower()):
            if cand in catalog_m2:
                mpm_c = float(catalog_m2[cand])
                kpm_r = float(cat_k[cand]) if (cat_k and cand in cat_k) else None
                cat_hit = cand
                break
        if mpm_c is None:
            continue
        r.profile_key = cat_hit
        r.catalog_m2_per_m = mpm_c
        r.catalog_kg_per_m = kpm_r
        dlen_b = (r.length_mm / 1000.0) * max(1, r.qty)
        r.area_m2 = mpm_c * dlen_b
        _append_row_note(r, f"ключ из LLM: «{hk}»")
        touched += 1
    return touched


def bom_kg_per_m_reference(r: SpecRow) -> float | None:
    """Линейная масса из ведомости (кг/м): приоритет кг Σ, иначе кг/шт×qty — как в reconcile/validate."""
    dlen = (r.length_mm / 1000.0) * max(1, r.qty)
    if dlen <= 1e-9:
        return None
    mt = r.mass_kg_total
    mu = r.mass_kg_unit
    mt_ref: float | None = None
    if mt is not None and float(mt) > 1e-6:
        mt_ref = float(mt)
    elif mu is not None:
        mt_ref = float(mu) * max(1, r.qty)
    if mt_ref is None or mt_ref <= 1e-6:
        return None
    return mt_ref / dlen


def collect_catalog_key_candidates(
    r: SpecRow,
    catalog_m2: dict[str, float],
    catalog_kg: dict[str, float] | None,
    *,
    max_keys: int = 12,
) -> list[str]:
    """
    Кандидаты ключей CSV для строки (whitelist для арбитра кг/м).
    Пластины: сначала ключи B×t из обозначения/плейта, затем остальное.
    """
    cat_k = catalog_kg or {}
    prof_raw = _fix_ocr_digit_confusables((r.profile_raw or "").strip())
    keys_try: list[str] = []
    tk_pref, _ = plate_profile_catalog_key_pref(prof_raw)
    triple_v = parse_plate_t_triple_mm(_unify_profile_chars(_clean_profile_cell(r.profile_raw)))
    plate_mode = bool(tk_pref or triple_v is not None)
    if tk_pref:
        keys_try.append(tk_pref)
    if r.profile_key:
        keys_try.append(r.profile_key)
    nk = _normalize_profile_key(prof_raw)
    if nk:
        keys_try.append(nk)
    wxh_list = _all_wxh_keys_from_text(prof_raw)
    if len(wxh_list) == 1:
        parts = wxh_list[0].lower().replace("х", "x").split("x")
        if len(parts) == 2:
            try:
                a0, b0 = int(parts[0]), int(parts[1])
                Bc, tc = _canonical_plate_width_thickness_mm(a0, b0)
                if f"{Bc}x{tc}".lower() != wxh_list[0].lower():
                    keys_try.append(f"{Bc}x{tc}")
            except ValueError:
                pass
    for wxh in wxh_list:
        keys_try.append(wxh)
    sk = _slug_catalog_key(prof_raw)
    if sk:
        keys_try.extend(_slug_variants(sk))
        for gt in _gost_slug_tokens(sk):
            keys_try.append(gt)
            keys_try.extend(_slug_variants(gt))
        for suf in _rolled_section_slug_variants(sk):
            keys_try.append(suf)
            keys_try.extend(_slug_variants(suf))
            for gt in _gost_slug_tokens(suf):
                keys_try.append(gt)
                keys_try.extend(_slug_variants(gt))
    cand_keys: list[str] = []
    seen_c: set[str] = set()
    for k in keys_try:
        if not k:
            continue
        for cand in _slug_variants(k.lower()):
            if cand not in seen_c:
                seen_c.add(cand)
                cand_keys.append(cand)
    wxh_slug_set: set[str] = set()
    for wx in wxh_list:
        for sv in _slug_variants(wx.lower()):
            wxh_slug_set.add(sv)
    hint = (nk or r.profile_key or (wxh_list[0] if wxh_list else "") or prof_raw).strip()
    for sim in similar_catalog_dim_keys(hint, catalog_m2, limit=8):
        for cand in _slug_variants(sim.lower()):
            if cand not in seen_c:
                seen_c.add(cand)
                cand_keys.append(cand)
    in_catalog: list[str] = []
    for cand in cand_keys:
        if cand in catalog_m2 and cand not in in_catalog:
            in_catalog.append(cand)
    if not in_catalog:
        return []
    plate_first: list[str] = []
    rest: list[str] = []
    seen_p: set[str] = set()
    if plate_mode:
        for cand in in_catalog:
            if cand in wxh_slug_set or re.fullmatch(r"\d{1,5}x\d{1,3}", cand, re.I):
                if cand not in seen_p:
                    plate_first.append(cand)
                    seen_p.add(cand)
        for cand in in_catalog:
            if cand not in seen_p:
                rest.append(cand)
        ordered = plate_first + rest
    else:
        ordered = in_catalog
    return ordered[:max_keys]


def apply_catalog_key_only_to_row(
    r: SpecRow,
    catalog_key: str,
    catalog_m2: dict[str, float],
    catalog_kg: dict[str, float] | None,
) -> bool:
    """Подставить ключ и пересчитать м²/м из каталога (без fuzzy)."""
    cat_k = catalog_kg or {}
    hit: str | None = None
    for cand in _slug_variants(catalog_key.strip().lower()):
        if cand in catalog_m2:
            hit = cand
            break
    if not hit:
        return False
    r.profile_key = hit
    r.catalog_m2_per_m = float(catalog_m2[hit])
    r.catalog_kg_per_m = float(cat_k[hit]) if hit in cat_k else None
    dlen = (r.length_mm / 1000.0) * max(1, r.qty)
    r.area_m2 = float(r.catalog_m2_per_m) * dlen
    return True


def apply_profile_aliases_to_rows(
    rows: list[SpecRow],
    aliases: dict[str, str],
    catalog_m2: dict[str, float],
    catalog_kg: dict[str, float] | None,
) -> int:
    """Перед apply_catalog: raw_canon → profile_key, если ключ есть в каталоге (м² подставит apply_catalog)."""
    if not aliases:
        return 0
    touched = 0
    for r in rows:
        ck = profile_raw_canonical_key(r.profile_raw)
        raw_alias = (aliases.get(ck) or "").strip()
        if not raw_alias:
            continue
        hk = sanitize_llm_profile_key_hint(raw_alias)
        if not hk:
            continue
        hit: str | None = None
        for cand in _slug_variants(hk.lower()):
            if cand in catalog_m2:
                hit = cand
                break
        if hit:
            r.profile_key = hit
            _append_row_note(r, f"алиас проекта → «{hit}»")
            touched += 1
    return touched


def total_metal_area(rows: list[SpecRow]) -> float:
    return sum(r.area_m2 for r in rows if r.catalog_m2_per_m is not None)


def within_tolerance(a: float, b: float, rel_pct: float, abs_floor: float) -> bool:
    """Совпадение по относительному % и/или абсолютному полу (масса)."""
    if math.isclose(a, b, rel_tol=max(rel_pct / 100.0, 1e-9), abs_tol=abs_floor):
        return True
    d = abs(a - b)
    ref = max(abs(a), abs(b), 1e-9)
    if d <= abs_floor:
        return True
    return (d / ref) <= (rel_pct / 100.0)


def _msg(severity: str, code: str, message: str, **extra: Any) -> dict[str, Any]:
    o: dict[str, Any] = {"severity": severity, "code": code, "message": message}
    o.update(extra)
    return o


def lint_catalog(path: str | None | Sequence[str] = None) -> list[dict[str, Any]]:
    """Проверка CSV до расчёта (каждый файл отдельно)."""
    paths = _catalog_paths_arg(path)
    out: list[dict[str, Any]] = []
    if not paths:
        return out
    for p in paths:
        tag = os.path.basename(p)
        pfx = f"[{tag}] "
        seen: dict[str, tuple[float, float | None, int]] = {}
        line_no = 0
        any_kg = False
        with open(p, "r", encoding="utf-8-sig", newline="") as f:
            sample = f.read(4096)
            f.seek(0)
            delim = ";" if sample.count(";") >= sample.count(",") else ","
            r = csv.reader(f, delimiter=delim)
            for row in r:
                line_no += 1
                if not row or not str(row[0]).strip():
                    continue
                k0 = str(row[0]).strip()
                if k0.startswith("#"):
                    continue
                low = k0.lower()
                if low in ("ключ", "key", "профиль", "profile", "кг_на_пм", "kg_per_m"):
                    continue
                try:
                    v_m2 = float(str(row[1]).replace(",", ".").strip())
                except (ValueError, IndexError):
                    continue
                v_kg: float | None = None
                if len(row) > 2 and str(row[2]).strip():
                    try:
                        v_kg = float(str(row[2]).replace(",", ".").strip())
                        any_kg = True
                    except ValueError:
                        v_kg = None
                keys: list[str] = []
                nk = _normalize_profile_key(k0)
                if nk:
                    keys.append(nk.lower())
                sk = _slug_catalog_key(k0)
                if sk:
                    keys.append(sk)
                for key in keys:
                    if v_m2 < 0 or (v_kg is not None and v_kg < 0):
                        out.append(
                            _msg(
                                "error",
                                "catalog_negative",
                                f"{pfx}Стр. {line_no}: отрицательный коэффициент для «{k0}»",
                            )
                        )
                    if v_m2 == 0:
                        out.append(
                            _msg("warning", "catalog_zero_m2", f"{pfx}Стр. {line_no}: м²/м = 0 для «{k0}»")
                        )
                    prev = seen.get(key)
                    if prev is not None:
                        pm2, pkg, pln = prev
                        if pln != line_no:
                            if not math.isclose(pm2, v_m2, rel_tol=1e-6) or (
                                pkg is not None and v_kg is not None and not math.isclose(pkg, v_kg, rel_tol=1e-6)
                            ):
                                out.append(
                                    _msg(
                                        "error",
                                        "catalog_duplicate_key",
                                        f"{pfx}Конфликт ключей после нормализации ({key}): строки {pln} и {line_no}",
                                    )
                                )
                            elif (pkg is None) != (v_kg is None) and any_kg:
                                out.append(
                                    _msg(
                                        "info",
                                        "catalog_partial_kg",
                                        f"{pfx}Стр. {line_no}: для «{k0}» неполная колонка кг при наличии кг в других строках",
                                    )
                                )
                    seen[key] = (v_m2, v_kg, line_no)
    return out


_RE_EXPLICIT_PAINT = re.compile(
    r"(?:площадь\s+окраск|окрашиваемая\s+площадь|S\s*окр\.?|paint\s*area|coating\s*area)[^\d]{0,48}(\d{1,5}(?:[.,]\d+)?)\s*(?:м\s*2|м²|m2)",
    re.IGNORECASE,
)


def extract_explicit_paint_area_m2(text: str) -> tuple[float | None, list[float]]:
    """
    Явная площадь окраски в тексте чертежа.
    Возвращает (единственное значение м² | None, список всех найденных — для ambiguous).
    """
    found: list[float] = []
    for m in _RE_EXPLICIT_PAINT.finditer(text):
        try:
            found.append(float(m.group(1).replace(",", ".")))
        except ValueError:
            continue
    if not found:
        return None, []
    uniq = sorted({round(x, 6) for x in found})
    if len(uniq) == 1:
        return uniq[0], found
    return None, found


def validate_metal_rows(
    rows: list[SpecRow],
    *,
    tolerance_pct: float = 2.0,
    abs_kg_tol: float = 0.05,
    explicit_paint_m2: float | None = None,
    explicit_candidates: list[float] | None = None,
    catalog_m2_lookup: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Самопроверки по строкам и сводам. explicit_candidates — сырые вхождения при неоднозначности."""
    val: list[dict[str, Any]] = []
    catalog_has_kg = any(r.catalog_kg_per_m is not None for r in rows)

    if explicit_candidates and len(set(round(x, 4) for x in explicit_candidates)) > 1:
        val.append(
            _msg(
                "warning",
                "ambiguous_explicit_area",
                f"В тексте несколько явных площадей окраски: {explicit_candidates} — автосверка отключена",
            )
        )
    elif explicit_paint_m2 is not None:
        total_a = sum(r.area_m2 for r in rows)
        if not within_tolerance(total_a, explicit_paint_m2, tolerance_pct, max(0.01, 0.01 * explicit_paint_m2)):
            val.append(
                _msg(
                    "warning",
                    "totals_vs_explicit_text",
                    f"Сумма по строкам {total_a:.4f} м² vs явная в тексте {explicit_paint_m2:.4f} м² (допуск {tolerance_pct}%)",
                )
            )

    # Один номер позиции в разных марках сборки на склеенном КМД — норма; считаем дубликаты внутри марки.
    pos_count: dict[tuple[str, str], int] = {}
    for r in rows:
        mk_norm = _normalize_assembly_mark((r.assembly_mark or "").strip())
        pq = str(r.position).strip()
        pos_count[(mk_norm, pq)] = pos_count.get((mk_norm, pq), 0) + 1
    for (mk_norm, pos), c in pos_count.items():
        if c > 1:
            val.append(
                _msg(
                    "warning",
                    "duplicate_position",
                    f'Марка {mk_norm or "—"}: поз.{pos} встречается {c} раз',
                    position=pos,
                    assembly_mark=mk_norm,
                )
            )

    for r in rows:
        pos = r.position
        am = r.assembly_mark
        lc = getattr(r, "layout_confidence", None)
        rs = str(getattr(r, "row_source", "flat") or "flat").strip().lower()
        if rs == "spatial" and lc is not None and float(lc) < 0.42:
            val.append(
                _msg(
                    "info",
                    "low_layout_confidence",
                    f"Поз.{pos}: низкая уверенность геометрического разбора столбцов (~{float(lc):.2f}); сверьте с PDF.",
                    position=pos,
                    assembly_mark=am,
                )
            )
        if r.length_mm < 25 or r.length_mm > 120000:
            val.append(
                _msg(
                    "info",
                    "length_suspicious",
                    f"Поз.{pos}: дл {r.length_mm:.0f} мм вне типичного диапазона — проверьте единицы в PDF",
                    position=pos,
                    assembly_mark=am,
                )
            )
        if 0 < r.length_mm < 100:
            val.append(
                _msg(
                    "info",
                    "short_length_units",
                    f"Поз.{pos}: длина {r.length_mm:.0f} мм — проверьте единицы (мм/м)",
                    position=pos,
                    assembly_mark=am,
                )
            )

        triple_v = parse_plate_t_triple_mm(_unify_profile_chars(_clean_profile_cell(r.profile_raw)))
        if triple_v is not None:
            if not triple_length_matches_table_mm(triple_v, float(r.length_mm)):
                val.append(
                    _msg(
                        "warning",
                        "plate_sect_vs_table_length",
                        f"Поз.{pos}: в обозначении пластины L={triple_v.ell_mm} мм расходится с длиной ведомости {r.length_mm:.0f} мм",
                        position=pos,
                        assembly_mark=am,
                    )
                )
            Bt, tt = triple_plate_catalog_width_thickness_mm(triple_v)
            mtref = r.mass_kg_total
            if mtref is not None and float(mtref) > 1e-6 and r.length_mm > 0 and r.qty > 0:
                dlen_geom = (r.length_mm / 1000.0) * max(1, r.qty)
                if dlen_geom > 1e-9:
                    kg_obs = float(mtref) / dlen_geom
                    kg_strip = _plate_kg_per_m(Bt, tt)
                    if kg_strip > 1e-6 and kg_obs > kg_strip * 1.15:
                        val.append(
                            _msg(
                                "warning",
                                "plate_triple_mass_vs_strip",
                                f"Поз.{pos}: кг/м ведомости {kg_obs:.4f} сильнее ожидания для полосы {Bt}×{tt} мм по сечению t×…×… (~{kg_strip:.4f} кг/м)",
                                position=pos,
                                assembly_mark=am,
                            )
                        )

        if (r.profile_key or r.profile_raw.strip()) and r.catalog_m2_per_m is None:
            hint = (r.profile_key or _normalize_profile_key(r.profile_raw) or r.profile_raw[:20]).strip()
            sim_txt = ""
            if catalog_m2_lookup:
                sim = similar_catalog_dim_keys(hint, catalog_m2_lookup, limit=5)
                if sim:
                    sim_txt = " Похожие ключи в CSV: " + ", ".join(sim) + "."
            val.append(
                _msg(
                    "warning",
                    "catalog_miss_m2",
                    f"Поз.{pos}: нет м²/м в CSV для «{r.profile_raw[:40]}».{sim_txt}",
                    position=pos,
                    assembly_mark=am,
                )
            )
        if catalog_has_kg and (r.profile_key or r.profile_raw.strip()) and r.catalog_kg_per_m is None:
            val.append(
                _msg(
                    "info",
                    "catalog_miss_kg",
                    f"Поз.{pos}: нет кг/м в CSV для «{r.profile_raw[:40]}»",
                    position=pos,
                    assembly_mark=am,
                )
            )

        mu, mt = r.mass_kg_unit, r.mass_kg_total
        # Для сверки с каталогом опираемся на reconcile (приоритет «кг Σ», иначе кг/шт×qty).
        bom_masses_ok = (
            (mt is not None and float(mt) > 1e-6)
            or (mu is not None and float(mu) * max(1, r.qty) > 1e-6)
        )
        if mu is not None and mt is not None and float(mt) > 1e-6:
            exp = float(mu) * r.qty
            if not _pdf_bom_unit_times_qty_matches_total(mu, mt, r.qty):
                val.append(
                    _msg(
                        "info",
                        "bom_mass_qty",
                        f"Поз.{pos}: м_шт×qty ({exp:.3f}) и м_всего ({float(mt):.3f}) кг в PDF расходятся — "
                        f"для расчёта взята «кг Σ» (см. reconcile).",
                        position=pos,
                        assembly_mark=am,
                    )
                )

        if r.catalog_kg_per_m is not None and r.length_mm > 0 and r.qty > 0:
            m_calc = r.catalog_kg_per_m * (r.length_mm / 1000.0) * r.qty
            ref_m = mt if mt is not None else (mu * r.qty if mu is not None else None)
            if ref_m is not None and ref_m > 1e-6:
                if not within_tolerance(m_calc, ref_m, tolerance_pct, abs_kg_tol):
                    sev = "info" if bom_masses_ok else "warning"
                    hint = (
                        " Ведомость по массам согласована — проверьте кг/м в CSV под ваш прокат."
                        if bom_masses_ok
                        else ""
                    )
                    val.append(
                        _msg(
                            sev,
                            "catalog_mass",
                            f"Поз.{pos}: масса по каталогу {m_calc:.3f} кг vs ведомость {ref_m:.3f} кг.{hint}",
                            position=pos,
                            assembly_mark=am,
                        )
                    )

        if mt is not None and r.length_mm > 0 and r.qty > 0:
            denom = (r.length_mm / 1000.0) * r.qty
            if denom > 1e-9:
                kgpm_bom = mt / denom
                if r.catalog_kg_per_m is not None and r.catalog_kg_per_m > 1e-9:
                    if not within_tolerance(kgpm_bom, r.catalog_kg_per_m, tolerance_pct, 0.01):
                        sev = "info" if bom_masses_ok else "warning"
                        hint = (
                            " Проверьте кг/м в CSV (линейная масса из ведомости достоверна при согласованных массах)."
                            if bom_masses_ok
                            else ""
                        )
                        val.append(
                            _msg(
                                sev,
                                "implied_kgpm",
                                f"Поз.{pos}: кг/м из ведомости {kgpm_bom:.4f} vs каталог {r.catalog_kg_per_m:.4f}.{hint}",
                                position=pos,
                                assembly_mark=am,
                            )
                        )

        if (
            mt is not None
            and r.catalog_kg_per_m is not None
            and r.catalog_m2_per_m is not None
            and r.catalog_kg_per_m > 1e-9
        ):
            area_implied = mt * (r.catalog_m2_per_m / r.catalog_kg_per_m)
            if not within_tolerance(area_implied, r.area_m2, tolerance_pct, max(0.001, 0.01 * r.area_m2)):
                sev = "info" if bom_masses_ok else "warning"
                hint = (
                    " При согласованных массах расхождение обычно из‑за несоответствия пары м²/м и кг/м в CSV."
                    if bom_masses_ok
                    else ""
                )
                val.append(
                    _msg(
                        sev,
                        "area_via_mass",
                        f"Поз.{pos}: площадь по массе {area_implied:.4f} м² vs по длине {r.area_m2:.4f} м².{hint}",
                        position=pos,
                        assembly_mark=am,
                    )
                )

    by_mark: dict[str, float] = {}
    for r in rows:
        by_mark[r.assembly_mark] = by_mark.get(r.assembly_mark, 0.0) + r.area_m2
    s = sum(by_mark.values())
    tcalc = sum(r.area_m2 for r in rows)
    if not math.isclose(s, tcalc, rel_tol=1e-5, abs_tol=1e-4):
        val.append(_msg("error", "sum_area_mismatch", f"Внутренняя ошибка сумм по маркам: {s} vs {tcalc}"))

    sm_pdf = sum(r.mass_kg_total for r in rows if r.mass_kg_total is not None)
    n_mass = sum(1 for r in rows if r.mass_kg_total is not None)
    if n_mass:
        val.append(_msg("info", "sum_mass_bom", f"Σ масс по ведомости (где задано): {sm_pdf:.3f} кг, строк {n_mass}"))

    sm_calc = sum(
        (r.catalog_kg_per_m or 0.0) * (r.length_mm / 1000.0) * r.qty
        for r in rows
        if r.catalog_kg_per_m is not None
    )
    n_kg = sum(1 for r in rows if r.catalog_kg_per_m is not None)
    if n_kg and n_mass and sm_pdf > 1e-6:
        if not within_tolerance(sm_calc, sm_pdf, tolerance_pct, max(1.0, 0.02 * sm_pdf)):
            val.append(
                _msg(
                    "info",
                    "sum_mass_calc_vs_bom",
                    f"Σ масс по каталогу {sm_calc:.3f} кг vs Σ по ведомости {sm_pdf:.3f} кг — "
                    "уточните колонку кг/м в CSV под ваши профили.",
                )
            )

    return val


def summarize_metal_validation(validation: list[dict[str, Any]] | None) -> dict[str, Any]:
    """
    Сводка для экспорта и UI: количество по severity и частые коды сверки
    (catalog_mass, implied_kgpm, area_via_mass и т.д.).
    """
    val = list(validation or [])
    by_sev: dict[str, int] = {}
    by_code: dict[str, int] = {}
    for v in val:
        s = str(v.get("severity") or "")
        by_sev[s] = by_sev.get(s, 0) + 1
        c = v.get("code")
        if c:
            ck = str(c)
            by_code[ck] = by_code.get(ck, 0) + 1
    top = sorted(by_code.items(), key=lambda kv: (-kv[1], kv[0]))[:24]
    return {
        "count_total": len(val),
        "by_severity": by_sev,
        "codes_top": [{"code": c, "count": n} for c, n in top],
    }


def build_quality_metrics(
    validation: list[dict[str, Any]],
    rows: list[SpecRow],
) -> dict[str, Any]:
    err = sum(1 for v in validation if v.get("severity") == "error")
    warn = sum(1 for v in validation if v.get("severity") == "warning")
    n = max(1, len(rows))
    cov_m2 = sum(1 for r in rows if r.catalog_m2_per_m is not None) / n
    cov_kg = sum(1 for r in rows if r.catalog_kg_per_m is not None) / n
    cov_mass = sum(1 for r in rows if r.mass_kg_total is not None) / n
    total_area = sum(r.area_m2 for r in rows)
    delta_1pct = total_area * 0.01
    score = 100
    score -= err * 18
    score -= warn * 4
    score -= int(24 * (1.0 - cov_m2))
    score = max(0, min(100, score))
    if err == 0 and cov_m2 >= 0.85:
        score = max(score, 35)
    return {
        "error_count": err,
        "warning_count": warn,
        "coverage_m2_pct": round(cov_m2 * 100, 1),
        "coverage_kg_pct": round(cov_kg * 100, 1),
        "coverage_mass_pct": round(cov_mass * 100, 1),
        "confidence_score": score,
        "total_area_m2": round(total_area, 6),
        "sensitivity_delta_m2_if_catalog_plus_1pct": round(delta_1pct, 6),
        "score_note": "Индекс качества разбора (эвристика), не сертификат точности.",
    }


def cross_file_mark_checks(
    path_to_metal_lines: dict[str, list[dict[str, Any]]],
    tolerance_pct: float = 5.0,
    *,
    min_abs_delta_m2: float = 0.35,
) -> list[dict[str, Any]]:
    """Одна марка в разных PDF — сравнение суммарных м² (игнор мелких расхождений)."""
    by_mark: dict[str, list[tuple[str, float]]] = {}
    for path, lines in path_to_metal_lines.items():
        base = os.path.basename(path)
        per: dict[str, float] = {}
        for ml in lines:
            mk = str(ml.get("assembly_mark") or "Без марки")
            per[mk] = per.get(mk, 0.0) + float(ml.get("area_m2") or 0)
        for mk, ar in per.items():
            by_mark.setdefault(mk, []).append((base, ar))
    out: list[dict[str, Any]] = []
    for mk, pairs in by_mark.items():
        if len(pairs) < 2:
            continue
        bases = [p[0] for p in pairs]
        areas = [p[1] for p in pairs]
        if max(areas) < 1e-6:
            continue
        rel_spread = (max(areas) - min(areas)) / max(areas) * 100.0
        abs_delta = max(areas) - min(areas)
        if rel_spread > tolerance_pct and abs_delta >= min_abs_delta_m2:
            out.append(
                _msg(
                    "info",
                    "cross_file_mark_area",
                    f"Марка «{mk}» в файлах {bases}: м² {areas} — расхождение до {rel_spread:.1f}%",
                )
            )
    return out


def plate_triple_regress_smoke() -> tuple[bool, list[str]]:
    errs: list[str] = []
    for raw, want_key, want_disp in PLATE_TRIPLE_TEST_VECTORS:
        pk, _tr = plate_profile_catalog_key_pref(raw or "")
        if pk != want_key:
            errs.append(f"ключ {raw!r}: ожид. {want_key!r}, факт {pk!r}")
        got_disp = profile_section_display_str(raw)
        if want_disp is not None and got_disp != want_disp:
            errs.append(f"подпись {raw!r}: ожид. {want_disp!r}, факт {got_disp!r}")
    return len(errs) == 0, errs


if __name__ == "__main__":
    ok, er = plate_triple_regress_smoke()
    if not ok:
        raise SystemExit("plate_triple_regress_smoke: " + "; ".join(er))
