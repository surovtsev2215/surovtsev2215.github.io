# -*- coding: utf-8 -*-
"""
Пайплайн ИД: нормализация текста, OCR для страниц без слоя текста, извлечение шифра и номеров,
lineage (происхождение полей), слияние с комплект_id.json, валидация перед сборкой.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Типичные шифры: 90651-4100-1-ТИ-06-005, 90651-3100-ТИ-06-311А и похожие
ШИФР_RE = re.compile(
    r"\d{5}-\d{3,5}-\d+-?[ТТИтиИ]{2}-\d{2}-[\wА-Яа-яЁё\-]+",
    re.UNICODE,
)
НОМЕР_ЗС_RE = re.compile(
    r"№\s*\d+(?:\.\d+)?(?:-[ЗЗСС/ТТИИ]+(?:-[А-ЯЁ\d]+)?)?[^\s,]{0,40}",
    re.UNICODE,
)

_PIPELINE_SCHEMA_VERSION = "1.0"


def нормализовать_текст(s: str) -> str:
    if not s:
        return ""
    t = s.replace("\u00a0", " ").replace("\r\n", "\n").replace("\r", "\n")
    while "  " in t:
        t = t.replace("  ", " ")
    return t.strip()


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def ocr_доступен() -> bool:
    try:
        import pytesseract as pt

        pt.get_tesseract_version()
        return True
    except Exception:
        return False


def _страницы_без_текста(conn) -> list[tuple[int, str, int, int]]:
    cur = conn.execute(
        """
        SELECT p.id, d.original_path, p.page_no, p.doc_id
        FROM rd_page p JOIN rd_document d ON d.id = p.doc_id
        WHERE COALESCE(p.char_count, 0) = 0 OR TRIM(COALESCE(p.text, '')) = ''
        ORDER BY d.id, p.page_no
        """
    )
    return [(int(r[0]), str(r[1]), int(r[2]), int(r[3])) for r in cur.fetchall()]


def применить_ocr_к_пустым_страницам(conn, _rp_mod: Any) -> tuple[int, list[str]]:
    """
    Для страниц без текста: рендер через PyMuPDF + Tesseract.
    Возвращает (число распознанных страниц, сообщения диагностики).
    """
    msgs: list[str] = []
    if not ocr_доступен():
        msgs.append(
            "OCR недоступен: установите Tesseract OCR для Windows и пакет pytesseract "
            "(см. УСТАНОВКА.txt в папке ИД)."
        )
        return 0, msgs

    import fitz  # PyMuPDF
    import pytesseract
    from PIL import Image

    rows = _страницы_без_текста(conn)
    if not rows:
        return 0, ["Страниц без текста для OCR не найдено."]

    done = 0
    for page_id, orig, page_no, _doc_id in rows:
        pth = Path(orig)
        if not pth.is_file():
            msgs.append(f"Файл недоступен (стр. {page_no}): {orig}")
            continue
        try:
            doc = fitz.open(str(pth))
            try:
                page = doc.load_page(page_no - 1)
                m = fitz.Matrix(2.0, 2.0)
                pix = page.get_pixmap(matrix=m, alpha=False)
                img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                text = pytesseract.image_to_string(img, lang="rus+eng") or ""
            finally:
                doc.close()
        except Exception as e:
            msgs.append(f"OCR ошибка {pth.name} стр.{page_no}: {e}")
            continue

        text = нормализовать_текст(text)
        cc = len(text)
        qual = "ocr"
        if cc == 0:
            qual = "ocr_empty"
        flags = json.dumps({"ocr": True}, ensure_ascii=False)
        conn.execute(
            "UPDATE rd_page SET text = ?, char_count = ?, quality = ?, flags_json = ? WHERE id = ?",
            (text, cc, qual, flags, page_id),
        )
        done += 1

    try:
        conn.commit()
    except Exception:
        pass
    msgs.append(f"OCR обработано страниц: {done} из {len(rows)}.")
    return done, msgs


def собрать_полный_текст(conn) -> str:
    cur = conn.execute(
        """
        SELECT d.filename, p.page_no, p.text
        FROM rd_page p JOIN rd_document d ON d.id = p.doc_id
        ORDER BY d.id, p.page_no
        """
    )
    parts: list[str] = []
    for fn, pno, txt in cur.fetchall():
        t = нормализовать_текст(str(txt or ""))
        if t:
            parts.append(f"\n--- {fn} стр.{pno} ---\n{t}")
    cur2 = conn.execute("SELECT filename FROM rd_document ORDER BY id")
    for (fn,) in cur2.fetchall():
        parts.insert(0, f"[Имя файла: {fn}]")
    return "\n".join(parts)


def извлечь_поля_из_текста(blob: str, lineage: dict[str, Any]) -> dict[str, Any]:
    """Детерминированное извлечение: шифр и номера ЗС/ТИ (для подстановки и lineage)."""
    blob_n = нормализовать_текст(blob)
    out: dict[str, Any] = {}

    шифры = ШИФР_RE.findall(blob_n)
    if шифры:
        best = max(шифры, key=len)
        out["шифр"] = best
        lineage["шифр"] = {
            "значение": best,
            "метод": "regex",
            "уверенность": "high" if len(шифры) == 1 else "medium",
            "найдено_совпадений": len(шифры),
            "фрагмент": best[:120],
        }

    zs = list(dict.fromkeys(НОМЕР_ЗС_RE.findall(blob_n)))[:20]
    if zs:
        out["номера_зс_кандидаты"] = zs
        lineage["номера_зс_кандидаты"] = {"метод": "regex", "значения": zs}

    return out


def слить_конфиг_с_извлечением(
    базовый_cfg: dict[str, Any],
    извлечено: dict[str, Any],
    lineage: dict[str, Any],
    *,
    перезаписать_шифр: bool = True,
    основание_из_первого_номера: bool = False,
) -> dict[str, Any]:
    merged = dict(базовый_cfg)
    merged["_pipeline_schema"] = _PIPELINE_SCHEMA_VERSION

    if перезаписать_шифр and извлечено.get("шифр"):
        old = str(merged.get("шифр") or "").strip()
        new = str(извлечено["шифр"]).strip()
        if new:
            merged["шифр"] = new
            pairs = list(merged.get("замены_в_титуле") or [])
            if isinstance(pairs, list):
                tpl_cipher = None
                for p in pairs:
                    if isinstance(p, list) and len(p) >= 2 and str(p[0]) == str(p[1]):
                        tpl_cipher = str(p[0])
                        break
                if old and old != new:
                    pairs = [[old, new]] + [p for p in pairs if isinstance(p, list) and len(p) >= 2 and str(p[0]) != old]
                    merged["замены_в_титуле"] = pairs
                elif tpl_cipher and tpl_cipher != new:
                    seen = {str(p[0]) for p in pairs if isinstance(p, list) and len(p) >= 2}
                    if tpl_cipher not in seen:
                        merged["замены_в_титуле"] = [[tpl_cipher, new]] + pairs

    if основание_из_первого_номера:
        zs = извлечено.get("номера_зс_кандидаты") or []
        if zs and not str(merged.get("основание_кс") or "").strip():
            merged["основание_кс"] = f"Основание: {zs[0]}"

    merged["_lineage"] = lineage
    return merged


def проверить_перед_комплектом(cfg: dict[str, Any]) -> tuple[list[str], list[str]]:
    err: list[str] = []
    warn: list[str] = []

    if not str(cfg.get("шифр") or "").strip():
        warn.append("Шифр проекта пуст — заполните комплект_id.json или загрузите PDF с шифром.")

    if not (cfg.get("позиции_реестра") or []):
        warn.append("Нет позиций реестра — проверьте комплект_id.json.")

    образец = Path(str(cfg.get("папка_образца") or "").strip())
    if cfg.get("копировать_все_файлы_из_образца") and not образец.is_dir():
        err.append(f"Папка образца не найдена: {образец}")

    return err, warn


def подготовить_manifest(
    cfg: dict[str, Any],
    pdf_paths: list[Path],
    validation_errors: list[str],
    validation_warnings: list[str],
    ocr_pages: int,
) -> dict[str, Any]:
    pdfs_info = []
    for p in pdf_paths:
        if p.is_file():
            pdfs_info.append({"path": str(p.resolve()), "sha256": _sha256_file(p)})

    cfg_snapshot = {k: v for k, v in cfg.items() if not str(k).startswith("_")}
    cfg_hash = hashlib.sha256(
        json.dumps(cfg_snapshot, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()

    return {
        "schema_version": _PIPELINE_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "utility": "ИД",
        "input_pdfs": pdfs_info,
        "cfg_sha256": cfg_hash,
        "ocr_pages_processed_session": ocr_pages,
        "validation_errors": validation_errors,
        "validation_warnings": validation_warnings,
        "режим": cfg.get("режим_комплекта") or "final",
    }


def сохранить_lineage(util_dir: Path, lineage: dict[str, Any]) -> None:
    p = util_dir / "Данные" / "lineage_last.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(lineage, ensure_ascii=False, indent=2), encoding="utf-8")


def обновить_метаданные_проекта(conn, rp_mod: Any, шифр: str | None, заголовок: str | None) -> None:
    meta = rp_mod.get_meta(conn)
    kw: dict[str, Any] = {}
    if шифр and not str(meta.get("object_cipher") or "").strip():
        kw["object_cipher"] = шифр
    if заголовок and not str(meta.get("title") or "").strip():
        kw["title"] = заголовок
    if kw:
        rp_mod.update_meta(conn, **kw)


def cfg_без_служебных(cfg: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in cfg.items() if not str(k).startswith("_")}
