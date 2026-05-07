# -*- coding: utf-8 -*-
"""
LLM-дополнение для склеенных КМД: классификация окон, границы BOM/shipment,
кеш и опционально vision (низкое разрешение) при сыром тексте страницы.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    pass

ProgressCb = Callable[[int, str], None]


MERGED_SCHEMA_VERSION = 1
_CACHE_SUBDIR = "_akz_merged_llm_cache"

_SYSTEM_CLASSIFY = """Ты анализируешь фрагменты текста КМД (Tekla Structures), извлечённые из PDF.
Ответь ТОЛЬКО одним JSON-объектом (без markdown).

Обязательные поля:
- "schema_version": целое, сейчас 1.
- "bom_segments": массив объектов {"page_1based": int, "start_line": int, "end_line": int}.
  Номера строк относятся к строкам вида "0001|..." в каждом элементе массива "pages" запроса.
  Выбери интервалы, где идёт настоящая таблица «Спецификация деталей»: позиция, количество, профиль/длина, сталь, масса.
  Не включай ряды размерных линий чертежа, списков болтов без структуры ведомости.
- "shipment": массив {"mark": str, "qty": int} из блоков «ведомость отправочных элементов» в переданных фрагментах.
  Если не уверен — пустой массив.
- опционально "bom_material_rows": массив строк ведомости (только при уверенном чтении столбцов из текста),
  объекты вида {"position": str, "qty": int, "section": str, "length_mm": number, "steel": str,
   "mass_unit": number|null, "mass_total": number|null, "assembly_mark": str|null}.

Правило: минимум додумываний; пустые массивы лучше, чем выдуманные марки."""

_SYSTEM_VERIFY = """Ты проверяешь согласованность уже извлечённой ведомости с сырым текстом.
Ответь ТОЛЬКО JSON: {"schema_version":1,"ok":bool,"notes":string}
ok=true если текстовый фрагмент явно поддерживает таблицу; иначе false и коротко notes по-русски."""

_RE_SPEC_ANCHOR_LOCAL = re.compile(
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

_RE_SHIPMENT_ANCHOR = re.compile(
    r"(?:Ведомость\s+отправочных|ведомость\s+отправочных\s+элементов"
    r"|Statement\s+assembly\s+elements?|Statement\s+assembly)",
    re.IGNORECASE,
)


def _noop_progress(_p: int, _m: str) -> None:
    pass


def _cache_dir(util_dir: str) -> str:
    d = os.path.join(util_dir, _CACHE_SUBDIR)
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        pass
    return d


def _sha_key(parts: tuple[str, ...]) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8", errors="replace"))
        h.update(b"\x1e")
    return h.hexdigest()


def _numbered_excerpt(pg_text: str, max_lines: int = 140) -> str:
    lines = (pg_text or "").splitlines()[:max_lines]
    out: list[str] = []
    for j, ln in enumerate(lines):
        out.append(f"{j + 1:04d}|{ln[:260]}")
    return "\n".join(out)


def _pages_payload_for_llm(pages_text: list[str], max_pages: int = 16, max_lines: int = 120) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, pg in enumerate(pages_text):
        body = pg or ""
        if not (_RE_SPEC_ANCHOR_LOCAL.search(body) or _RE_SHIPMENT_ANCHOR.search(body)):
            continue
        out.append({"page_1based": i + 1, "lines": _numbered_excerpt(body, max_lines)})
        if len(out) >= max_pages:
            break
    return out


def _apply_bom_segments(pages_text: list[str], segments: list[Any]) -> str | None:
    if not isinstance(segments, list) or not segments:
        return None
    chunks: list[str] = []
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        try:
            pg = int(seg.get("page_1based")) - 1
            s = int(seg.get("start_line", 1)) - 1
            e = int(seg.get("end_line", 0))
        except (TypeError, ValueError):
            continue
        if pg < 0 or pg >= len(pages_text) or e <= s or s < 0:
            continue
        lines = pages_text[pg].splitlines()
        hi = min(e, len(lines))
        if s >= len(lines):
            continue
        piece = "\n".join(lines[s:hi]).strip()
        if len(piece) > 60:
            chunks.append(piece)
    if not chunks:
        return None
    sep = "\n\n<<<PTO_PAGE_BREAK>>>\n\n"
    return sep.join(chunks)


def _normalize_shipments(raw: Any, normalize_mark_fn: Any) -> dict[str, int]:
    out: dict[str, int] = {}
    if not isinstance(raw, list):
        return out
    for item in raw:
        if not isinstance(item, dict):
            continue
        mk = str(item.get("mark") or "").strip()
        q = item.get("qty")
        try:
            qi = int(q)
        except (TypeError, ValueError):
            continue
        if not mk or qi < 1 or qi > 5000:
            continue
        out[normalize_mark_fn(mk)] = qi
    return out


def read_merged_config(util_dir: str) -> dict[str, Any]:
    try:
        from ассистент_llm import прочитать_конфиг

        cfg = прочитать_конфиг(util_dir)
    except Exception:
        cfg = {}
    return {
        "merged_llm_default": bool(cfg.get("merged_llm_default")),
        "merged_llm_min_pages": int(cfg.get("merged_llm_min_pages") or 6),
        "allow_vision_default": bool(cfg.get("allow_vision_default")),
        "timeout_classify_sec": float(cfg.get("timeout_classify_sec") or 75.0),
        "timeout_extract_sec": float(cfg.get("timeout_extract_sec") or 120.0),
        "model_classify": (cfg.get("model_classify") or cfg.get("model") or "gpt-4o-mini"),
        "model_extract": (cfg.get("model_extract") or cfg.get("model") or "gpt-4o-mini"),
        "vision_scale": float(cfg.get("vision_scale") or 1.25),
        "vision_max_side_px": int(cfg.get("vision_max_side_px") or 980),
        "vision_max_pages": int(cfg.get("vision_max_pages") or 2),
        "sparse_text_chars": int(cfg.get("sparse_text_chars") or 320),
        "vision_on_layout_low": bool(cfg.get("vision_on_layout_low")),
        # По умолчанию LLM для больших PDF включается в фоне при сомнительной эвристике;
        # merged_llm_auto: false в assistant_config.json — только принудительный пункт меню или merged_llm_default.
        "merged_llm_auto": cfg.get("merged_llm_auto") is not False,
    }


def maybe_render_vision_assets(
    doc: Any | None,
    pages_text: list[str],
    util_dir: str,
    *,
    sparse_chars: int,
    max_pages: int,
    scale: float,
    max_side_px: int,
    force_indices_0based: list[int] | None = None,
) -> list[tuple[int, str]]:
    """Возвращает [(page_index_0based, base64_png), ...]."""
    del util_dir
    if doc is None or max_pages <= 0:
        return []
    sparse: list[int] = []
    if force_indices_0based:
        for i in force_indices_0based:
            if isinstance(i, int) and 0 <= i < len(pages_text):
                sparse.append(i)
                if len(sparse) >= max_pages:
                    break
    if not sparse:
        for i, t in enumerate(pages_text):
            if len((t or "").strip()) < sparse_chars and _RE_SPEC_ANCHOR_LOCAL.search(t or ""):
                sparse.append(i)
    if not sparse:
        return []
    try:
        import fitz
    except Exception:
        return []
    out: list[tuple[int, str]] = []
    for idx in sparse[:max_pages]:
        try:
            page = doc[idx]
            m_side = max(float(page.rect.width), float(page.rect.height)) or 1.0
            z = max(0.5, min(float(scale), 2.5))
            if m_side * z > max_side_px:
                z = max(0.4, max_side_px / m_side)
            mat = fitz.Matrix(z, z)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            bio = pix.tobytes("png")
            out.append((idx, base64.standard_b64encode(bio).decode("ascii")))
        except Exception:
            continue
    return out


def run_merged_llm_repair(
    util_dir: str,
    pages_text: list[str],
    *,
    progress: ProgressCb | None = None,
    basename_hint: str | None = None,
    merged_confidence: float = 0.0,
    validation_issue_count: int = 0,
    doc: Any | None = None,
    allow_vision: bool = False,
    layout_hints: dict[str, Any] | None = None,
) -> tuple[str | None, dict[str, int], dict[str, Any]]:
    """
    Возвращает (joint_bom_text_для_presegmented | None, shipment_overrides?, meta).
    meta: cache_hit, llm_error, phases[], vision_sent
    """
    prog = progress or _noop_progress
    meta: dict[str, Any] = {
        "phases": [],
        "cache_hit": False,
        "llm_error": "",
        "vision_sent": False,
        "schema_version": MERGED_SCHEMA_VERSION,
    }
    lh = layout_hints or {}

    mc = read_merged_config(util_dir)

    try:
        from ассистент_llm import post_chat_json
        from ведомость_металл import _normalize_assembly_mark
    except ImportError as e:
        meta["llm_error"] = str(e)
        return None, {}, meta

    pages_payload = _pages_payload_for_llm(pages_text)
    if not pages_payload:
        meta["llm_error"] = "Нет страниц с якорями BOM/отправки для LLM."
        return None, {}, meta

    key_core = json.dumps(pages_payload, ensure_ascii=False)[:48000]
    cache_key = _sha_key(("v1-classify", key_core))
    cache_file = os.path.join(_cache_dir(util_dir), f"{cache_key}.json")
    cached_obj: dict[str, Any] | None = None
    if os.path.isfile(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cached_obj = dict(json.load(f))
            meta["cache_hit"] = True
            meta["phases"].append("cache_read")
        except Exception:
            cached_obj = None

    if cached_obj is not None:
        blob = cached_obj
    else:
        user_obj = {
            "schema_version": MERGED_SCHEMA_VERSION,
            "basename_hint": (os.path.basename(basename_hint or "") or ""),
            "merged_confidence": merged_confidence,
            "validation_issue_count": validation_issue_count,
            "pages": pages_payload,
        }
        prog(30, "LLM: классификация границ BOM…")
        blob, err = post_chat_json(
            util_dir,
            system=_SYSTEM_CLASSIFY,
            user_content=json.dumps(user_obj, ensure_ascii=False),
            model=str(mc.get("model_extract") or "gpt-4o-mini"),
            timeout_sec=min(180.0, float(mc["timeout_extract_sec"])),
            temperature=0.12,
        )
        meta["phases"].append("classify_post")
        if err or not blob:
            meta["llm_error"] = err or "Пустой ответ LLM"
            return None, {}, meta
        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(blob, f, ensure_ascii=False, indent=0)
        except OSError:
            pass

    if not isinstance(blob, dict):
        meta["llm_error"] = "Некорректный ответ или кеш LLM."
        return None, {}, meta

    segments = blob.get("bom_segments")

    shipment_llm_raw = blob.get("shipment")
    bom_text = _apply_bom_segments(pages_text, segments if isinstance(segments, list) else [])  # type: ignore[arg-type]
    shipments = _normalize_shipments(shipment_llm_raw, _normalize_assembly_mark)

    rows_json = blob.get("bom_material_rows")
    if isinstance(rows_json, list) and rows_json:
        meta["bom_material_rows"] = rows_json

    need_boost = bool(lh.get("need_vision_boost")) or bool(mc.get("vision_on_layout_low"))
    force_pages_raw = lh.get("bom_pages_sample") if isinstance(lh.get("bom_pages_sample"), list) else []
    force_ix: list[int] = []
    for x in force_pages_raw:
        try:
            xi = int(x)
        except (TypeError, ValueError):
            continue
        if 0 <= xi < len(pages_text):
            force_ix.append(xi)
    bom_short = not bom_text or len(bom_text.strip()) < 120
    if allow_vision and (bom_short or need_boost):
        assets = maybe_render_vision_assets(
            doc,
            pages_text,
            util_dir,
            sparse_chars=int(mc["sparse_text_chars"]),
            max_pages=int(mc["vision_max_pages"]),
            scale=float(mc["vision_scale"]),
            max_side_px=int(mc["vision_max_side_px"]),
            force_indices_0based=force_ix if (need_boost and force_ix) else None,
        )
        if assets:
            prog(52, "LLM: страницы изображением (vision)…")
            parts: list[dict[str, Any]] = [
                {"type": "text", "text": json.dumps({"task": "read_bom_from_images", "schema_version": 1}, ensure_ascii=False)},
            ]
            for pidx, b64 in assets:
                parts.append(
                    {
                        "type": "text",
                        "text": f"Страница PDF (индекс с нуля): {pidx}",
                    },
                )
                parts.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}"},
                    },
                )
            vb, verr = post_chat_json(
                util_dir,
                system=_SYSTEM_CLASSIFY.replace("pages\" запроса", "изображения"),
                user_content=parts,
                model=str(mc.get("model_extract") or "gpt-4o-mini"),
                timeout_sec=min(240.0, float(mc["timeout_extract_sec"]) + 60),
                temperature=0.08,
            )
            meta["vision_sent"] = True
            meta["phases"].append("vision_post")
            if not verr and isinstance(vb, dict):
                se2 = vb.get("bom_segments")
                if isinstance(se2, list):
                    alt = _apply_bom_segments(pages_text, se2)
                    if alt and len(alt) > len(bom_text or "") * 0.5:
                        bom_text = alt
                sh2 = _normalize_shipments(vb.get("shipment"), _normalize_assembly_mark)
                if sh2:
                    shipments = sh2
                rj2 = vb.get("bom_material_rows")
                if isinstance(rj2, list) and rj2:
                    meta["bom_material_rows"] = rj2

    if validation_issue_count > 8 and bom_text:
        prog(72, "LLM: доп. проверка фрагмента…")
        sample = bom_text[:5000]
        vb2, er2 = post_chat_json(
            util_dir,
            system=_SYSTEM_VERIFY,
            user_content=json.dumps(
                {"snippet": sample, "rows_hint": merged_confidence},
                ensure_ascii=False,
            ),
            model=str(mc.get("model_classify") or "gpt-4o-mini"),
            timeout_sec=min(120.0, float(mc["timeout_classify_sec"])),
            temperature=0.0,
        )
        meta["phases"].append("verify_post")
        if not er2 and isinstance(vb2, dict):
            meta["verification"] = vb2

    if not bom_text:
        meta["llm_error"] = meta.get("llm_error") or "LLM не выделила текст BOM."

    return bom_text, shipments, meta


def explicit_paint_vs_total_conflict(explicit_val: float | None, total_m2: float, *, ratio: float = 20.0) -> bool:
    if explicit_val is None or explicit_val < 5.0 or total_m2 < 500.0:
        return False
    return total_m2 > explicit_val * ratio
