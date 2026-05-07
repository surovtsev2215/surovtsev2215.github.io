# -*- coding: utf-8 -*-
"""
Извлечение строк ведомости по координатам текста PDF (PyMuPDF dict/spans).

Цель — совпадение колонок с визуальным порядком на листе, а не порядком get_text("text").
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from typing import Any

ROLE_ASSEMBLY_MARK = "assembly_mark"
ROLE_POSITION = "position"
ROLE_QTY = "qty"
ROLE_SECTION = "section"
ROLE_LENGTH = "length"
ROLE_MASS_SINGLE = "mass_single"
ROLE_MASS_TOTAL = "mass_total"
ROLE_ELEMENT_MASS = "element_mass"
ROLE_STEEL = "steel"
ROLE_NOTE = "note"


@dataclass(frozen=True)
class TextSpan:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str

    @property
    def xc(self) -> float:
        return (self.x0 + self.x1) * 0.5

    @property
    def y_mid(self) -> float:
        return (self.y0 + self.y1) * 0.5

    @property
    def height(self) -> float:
        return max(0.001, float(self.y1 - self.y0))


def spans_from_page_dict(page: Any) -> list[TextSpan]:
    """page: PyMuPDF Page; сбор всех текстовых span с bbox."""
    raw = page.get_text("dict")
    blocks = raw.get("blocks") if isinstance(raw, dict) else None
    out: list[TextSpan] = []
    if not isinstance(blocks, list):
        return out
    for b in blocks:
        if not isinstance(b, dict) or int(b.get("type", -1)) != 0:
            continue
        for line in b.get("lines") or []:
            if not isinstance(line, dict):
                continue
            for sp in line.get("spans") or []:
                if not isinstance(sp, dict):
                    continue
                t = sp.get("text")
                bbox = sp.get("bbox")
                if not isinstance(t, str) or not t.strip():
                    continue
                if not (isinstance(bbox, (list, tuple)) and len(bbox) >= 4):
                    continue
                x0, y0, x1, y1 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
                out.append(TextSpan(x0, y0, x1, y1, t))
    out.sort(key=lambda s: (s.y0, s.x0))
    return out


def _median(vals: list[float]) -> float:
    if not vals:
        return 0.0
    v = sorted(vals)
    m = len(v) // 2
    return float(v[m]) if len(v) % 2 else float(v[m - 1] + v[m]) * 0.5


def cluster_spans_into_lines(spans: list[TextSpan]) -> list[list[TextSpan]]:
    """Группы span в визуальные строки (по среднему Y)."""
    if not spans:
        return []
    heights = [s.height for s in spans]
    h_med = max(4.0, _median(heights))
    tol = max(2.8, min(14.0, 0.45 * h_med))

    spans_sorted = sorted(spans, key=lambda s: (s.y_mid, s.x0))
    lines: list[list[TextSpan]] = []
    current: list[TextSpan] = []
    y_ref = spans_sorted[0].y_mid

    for sp in spans_sorted:
        if not current:
            current = [sp]
            y_ref = sp.y_mid
            continue
        if abs(sp.y_mid - y_ref) <= tol:
            current.append(sp)
            y_ref = _median([s.y_mid for s in current])
        else:
            current.sort(key=lambda s: s.x0)
            lines.append(current)
            current = [sp]
            y_ref = sp.y_mid
    if current:
        current.sort(key=lambda s: s.x0)
        lines.append(current)
    return lines


def _compact(s: str) -> str:
    return re.sub(r"[\s_.,:;|/\\-]+", "", (s or "").lower()).replace("ё", "е")


_RE_BOM_NEAR = re.compile(
    r"(?:спецификац|ведомост[ьи]\s+детал|bill\s+of\s+materials|specification\s+of\s+parts)",
    re.IGNORECASE,
)


def _line_text(line: list[TextSpan]) -> str:
    return "".join(s.text for s in sorted(line, key=lambda x: x.x0)).strip()


def _bom_header_line_score(line: list[TextSpan]) -> float:
    lt = _compact(_line_text(line))
    if len(lt) < 5:
        return 0.0
    score = 0.0
    if _RE_BOM_NEAR.search(_line_text(line)):
        score += 2.0
    hints = (
        "сечени",
        "длин",
        "масса",
        "сталь",
        "№дет",
        "номердет",
        "позиц",
        "количество",
        "pcs",
        "profile",
        "length",
        "steel",
    )
    for h in hints:
        if h in lt:
            score += 0.85
    cells = _split_spans_into_microcells(line, [])
    for c in cells:
        if _best_role_for_header_cell(c):
            score += 1.1
    return score


def line_to_cells_with_edges(line_spans: list[TextSpan], edges_x: list[float]) -> list[str]:
    """edges_x — внутренние границы между колонками (по возрастанию)."""
    if not line_spans:
        return []
    spans = sorted(line_spans, key=lambda s: s.x0)
    ncols = max(1, len(edges_x) + 1)
    buckets: list[list[str]] = [[] for _ in range(ncols)]

    def col_for(xc: float) -> int:
        for i, e in enumerate(edges_x):
            if xc < e:
                return i
        return len(edges_x)

    for sp in spans:
        i = min(ncols - 1, max(0, col_for(sp.xc)))
        buckets[i].append(sp.text)

    cells: list[str] = []
    for parts in buckets:
        t = " ".join(p.strip() for p in parts if p)
        cells.append(re.sub(r"\s+", " ", t).strip())
    return cells


def _split_spans_into_microcells(line_spans: list[TextSpan], edges_x: list[float]) -> list[str]:
    """
    Если edges пустые — режем строку только по большим промежуткам между span
    (ещё один уровень сегментации для строки заголовка).
    """
    if edges_x:
        return line_to_cells_with_edges(line_spans, edges_x)
    spans = sorted(line_spans, key=lambda s: s.x0)
    if len(spans) <= 1:
        return [_line_text(spans)]
    gaps = [spans[i + 1].x0 - spans[i].x1 for i in range(len(spans) - 1)]
    med = max(8.0, _median(gaps) if gaps else 8.0)
    thresh = max(14.0, med * 1.85)
    parts: list[list[TextSpan]] = [[spans[0]]]
    for prev, cur in zip(spans, spans[1:]):
        gap = cur.x0 - prev.x1
        if gap > thresh:
            parts.append([cur])
        else:
            parts[-1].append(cur)
    return [" ".join(s.text.strip() for s in grp).strip() for grp in parts]


def _column_interior_edges(header_spans: list[TextSpan]) -> list[float]:
    """
    Вертикальные границы между колонками по промежуткам в строке-эталоне заголовков.
    """
    spans = sorted(header_spans, key=lambda s: s.x0)
    if len(spans) < 2:
        return []
    gaps = [(float(b.x0 + a.x1) * 0.5, float(b.x0 - a.x1)) for a, b in zip(spans, spans[1:])]
    if not gaps:
        return []
    gwidths = [g[1] for g in gaps]
    gm = max(8.0, _median(gwidths))
    # Если все промежутки одного порядка (широкие колонки), 1.35*median раздувает порог — границ не будет.
    thresh = max(20.0, min(gm * 0.92, gm + 28.0))
    edges: list[float] = []
    for mid, gw in gaps:
        if gw > thresh:
            edges.append(mid)
    return sorted(edges)


ROLE_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    (ROLE_ASSEMBLY_MARK, ("маркэлемент", "маркасбор", "маркасборк",)),
    (ROLE_POSITION, ("номерпозици", "позици", "поз", "№пози", "№дет", "номердет", "номдет")),
    (ROLE_QTY, ("колво", "количество", "кол-", "qty", "q-ty", "pcs")),
    (ROLE_SECTION, ("сечени", "сортамент", "профил", "profile",)),
    (ROLE_LENGTH, ("длин", "length",)),
    (ROLE_ELEMENT_MASS, ("весэлемента", "массыэлемент",)),
    (ROLE_MASS_SINGLE, ("однойдетал", "однойшт", "одной")),
    (ROLE_MASS_TOTAL, ("всехшт", "всехштук", "всех", "общ")),
    (ROLE_NOTE, ("примеч", "remark")),
    (ROLE_STEEL, ("марказастал", "маркахастал", "стальн",)),
    (ROLE_STEEL, ("сталь", "steel", "grade")),
]


def _best_role_for_header_cell(cell_raw: str) -> str | None:
    ln = (cell_raw or "").lower().replace("ё", "е")
    cn = _compact(cell_raw)
    if not cn or len(cn) < 1:
        return None
    scored: dict[str, float] = {}
    if "элемента" in ln and ("масс" in ln or "вес" in ln):
        scored[ROLE_ELEMENT_MASS] = scored.get(ROLE_ELEMENT_MASS, 0) + 6
    for role, keywords in ROLE_KEYWORDS:
        for kw in keywords:
            if kw in cn or kw in ln.replace(" ", ""):
                scored[str(role)] = scored.get(str(role), 0) + float(len(kw))
    if "масса" in ln or "кг" in ln:
        if "одной" in ln:
            scored[ROLE_MASS_SINGLE] = scored.get(ROLE_MASS_SINGLE, 0) + 4
        if "всех" in ln or "общ" in ln:
            scored[ROLE_MASS_TOTAL] = scored.get(ROLE_MASS_TOTAL, 0) + 4
    if re.match(r"^№\s*$", (cell_raw or "").strip()):
        scored[ROLE_POSITION] = scored.get(ROLE_POSITION, 0) + 8
    if cn in ("m", "н",):
        scored[ROLE_QTY] = scored.get(ROLE_QTY, 0) + 6
    if not scored:
        return None
    return max(scored.items(), key=lambda kv: kv[1])[0]


def infer_column_roles(header_cells: list[str]) -> list[str | None]:
    """Одна строка заголовка — по ячейке на колонку."""
    roles: list[str | None] = []
    for raw in header_cells:
        roles.append(_best_role_for_header_cell(raw or ""))
    return roles


def _detect_subheader_mass_line(line: list[TextSpan], edges: list[float]) -> list[str | None] | None:
    """
    Вторая строка под «МАССА»: одной шт | всех шт | элемента — дополняет роли столбцов.
    Возвращает только подстановки над None в предыдущей строке или новые колонки.
    """
    cells = line_to_cells_with_edges(line, edges)
    if len(cells) < 5:
        return None
    cells = line_to_cells_with_edges(line, edges)
    cl = "".join(_compact(cells[i]) for i in range(min(6, len(cells))))
    if not any(x in cl for x in ("одной", "одна", "единич", "всех")):
        return None
    patch: list[str | None] = [None] * len(cells)
    for i, raw in enumerate(cells):
        l = raw.lower().replace("ё", "е")
        if not l.strip():
            continue
        if "одной" in l or "единич" in l:
            patch[i] = ROLE_MASS_SINGLE
        elif "элемента" in l and ("масс" in l or "вес" in l):
            patch[i] = ROLE_ELEMENT_MASS
        elif "всех" in l or "общ" in l:
            patch[i] = ROLE_MASS_TOTAL
    return patch if any(patch) else None


def _assign_roles_fallback(ncols: int) -> list[str | None]:
    """Типичный русский порядок: марка поз кол сечение дл масс* сталь."""
    cand = (
        ROLE_ASSEMBLY_MARK,
        ROLE_POSITION,
        ROLE_QTY,
        ROLE_SECTION,
        ROLE_LENGTH,
        ROLE_MASS_SINGLE,
        ROLE_MASS_TOTAL,
        ROLE_ELEMENT_MASS,
        ROLE_STEEL,
        ROLE_NOTE,
    )
    return [cand[i] if i < len(cand) else None for i in range(ncols)]


@dataclass
class BomLayoutExtract:
    rows_data: list[dict[str, str]]
    col_roles: list[str | None]
    header_line_index: int
    page_quality: float
    debug_note: str = ""


def extract_bom_layout_from_page(page: Any) -> BomLayoutExtract:
    """
    Одна страница PDF → словарь строк {role: cell_text} только для узнаваемых строк ведомости.
    Если заголовок не найден или мало столбцов — пустой результат.
    """
    spans_all = spans_from_page_dict(page)
    if len(spans_all) < 8:
        return BomLayoutExtract([], [], -1, 0.0, "few_spans")

    lines = cluster_spans_into_lines(spans_all)
    if len(lines) < 3:
        return BomLayoutExtract([], [], -1, 0.0, "few_lines")

    best_hi = -1
    best_sc = -1.0
    for i, ln in enumerate(lines[: min(140, len(lines))]):
        sc = _bom_header_line_score(ln)
        if sc > best_sc:
            best_sc = sc
            best_hi = i

    # Нужно минимум 2 качественные подсказки по колонкам
    if best_hi < 0 or best_sc < 4.5:
        return BomLayoutExtract([], [], best_hi, float(best_sc), "weak_header_score")

    header_line = lines[best_hi]

    edges_used = _column_interior_edges(header_line)
    cell_texts = line_to_cells_with_edges(header_line, edges_used)

    if len(cell_texts) < 4:
        return BomLayoutExtract([], [], best_hi, float(best_sc), "too_few_header_cells")

    roles_h = infer_column_roles(cell_texts)
    if sum(1 for r in roles_h if r in (ROLE_POSITION, ROLE_SECTION, ROLE_LENGTH, ROLE_STEEL)) < 2:
        roles_h = _assign_roles_fallback(len(cell_texts))
        quality_note = "fallback_role_order"
    else:
        quality_note = "header_roles"

    if ROLE_POSITION not in roles_h:
        ix = roles_h.index(ROLE_QTY) if ROLE_QTY in roles_h else 1
        if ix > 0 and ix - 1 < len(roles_h) and roles_h[ix - 1] is None:
            roles_h[ix - 1] = ROLE_POSITION
        elif len(roles_h) > 1 and roles_h[1] is None:
            roles_h[1] = ROLE_POSITION

    data_start_idx = best_hi + 1
    if best_hi + 1 < len(lines):
        patch = _detect_subheader_mass_line(lines[best_hi + 1], edges_used)
        if patch:
            for i in range(min(len(roles_h), len(patch))):
                if patch[i]:
                    roles_h[i] = patch[i]
            data_start_idx = best_hi + 2

    ncols = len(cell_texts)
    data_rows: list[dict[str, str]] = []

    for line in lines[data_start_idx:]:
        cells = line_to_cells_with_edges(line, edges_used)
        if len(cells) != ncols:
            if len(cells) >= ncols * 2 // 3 and len(cells) <= ncols + 8:
                if len(cells) > ncols:
                    cells = cells[:ncols]
                else:
                    cells = cells + [""] * (ncols - len(cells))
            else:
                continue
        merged: dict[str, str] = {}
        for ci, txt in enumerate(cells[:ncols]):
            role = roles_h[ci] if ci < len(roles_h) else None
            if not role:
                continue
            t = txt.strip()
            if not t:
                continue
            merged[role] = (merged.get(role, "").strip() + " " + t).strip()

        lt = _compact(_line_text(line))
        if not merged:
            continue
        # хвосты отбрасываем
        if "вессварныхшвов" in lt or "сварныхшвов" in lt:
            continue
        if "итого" in lt and ROLE_POSITION not in merged:
            continue
        if _RE_BOM_NEAR.search(" ".join(merged.values())):
            continue

        pos_t = merged.get(ROLE_POSITION, "").strip()
        if not re.match(r"^\d{1,4}$", pos_t):
            continue
        data_rows.append(merged)

    page_q = min(1.0, best_sc / 12.0)
    if quality_note == "fallback_role_order":
        page_q *= 0.72

    return BomLayoutExtract(
        rows_data=data_rows,
        col_roles=roles_h,
        header_line_index=best_hi,
        page_quality=float(page_q),
        debug_note=quality_note,
    )


def _layout_regress_smoke() -> None:
    # Только строка заголовка + строка данных (без длинной «Спецификация», иначе span накладываются на Марку по X и ломают колонки)
    ln1 = [
        TextSpan(20, 130, 75, 146, "МАРКА"),
        TextSpan(185, 130, 240, 146, "№ дет."),
        TextSpan(345, 130, 380, 146, "Кол-во"),
        TextSpan(490, 130, 530, 146, "Сечение"),
        TextSpan(640, 130, 705, 146, "Длина"),
        TextSpan(820, 130, 898, 146, "Сталь"),
    ]
    lines = cluster_spans_into_lines(ln1)
    assert len(lines) >= 1
    hdr = lines[0]
    edges = _column_interior_edges(hdr)
    cells = line_to_cells_with_edges(hdr, edges)
    roles = infer_column_roles(cells)
    assert ROLE_SECTION in roles or ROLE_STEEL in roles
    row_line = [
        TextSpan(28, 164, 66, 182, "К1-47"),
        TextSpan(190, 164, 232, 182, "51"),
        TextSpan(350, 164, 375, 182, "1"),
        TextSpan(495, 164, 525, 182, "30Ш2"),
        TextSpan(650, 164, 692, 182, "6640"),
        TextSpan(830, 164, 885, 182, "С245"),
    ]
    rcells = line_to_cells_with_edges(sorted(row_line, key=lambda s: s.x0), edges)
    assert any("51" in c for c in rcells)
    assert any("6640" in c for c in rcells)


if __name__ == "__main__":
    _layout_regress_smoke()
