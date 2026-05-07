# -*- coding: utf-8 -*-
"""
Ядро утилиты «Обработка PDF»: PyMuPDF + опционально Tesseract, pdfplumber для таблиц.
"""

from __future__ import annotations

import hashlib
import io
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from typing import Any, Callable

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None  # type: ignore[misc, assignment]

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None  # type: ignore[misc, assignment]
    ImageOps = None  # type: ignore[misc, assignment]

try:
    import pytesseract
except ImportError:
    pytesseract = None  # type: ignore[misc, assignment]

try:
    import pdfplumber
except ImportError:
    pdfplumber = None  # type: ignore[misc, assignment]

TESSERACT_AVAILABLE = pytesseract is not None
PDFPLUMBER_AVAILABLE = pdfplumber is not None
FITZ_AVAILABLE = fitz is not None


def _now() -> float:
    return time.time()


@dataclass
class ProcessOptions:
    """Параметры одного прогона обработки."""

    preset: str = "auto"  # auto | native | ocr_always
    min_chars_native: int = 40
    dpi_render: int = 200
    lang: str = "rus+eng"
    psm: int = 3
    oem: int = 3
    max_pages: int | None = None
    stop_on_error: bool = False
    max_workers: int = 4
    extract_tables: bool = False
    preprocess_grayscale: bool = False
    preprocess_binarize: bool = False
    crop_margins_pct: float = 0.0  # 0–20
    rotate_extra: int = 0  # 0, 90, 180, 270
    dedup_by_native_for_ocr: bool = True  # при preset auto не дублировать OCR если натив достаточен


@dataclass
class PageOutcome:
    path: str
    page_index: int  # 0-based
    source: str  # native | ocr | mixed | empty
    text: str
    native_text: str
    char_count: int
    preview: str
    annotation_types: str
    annotation_count: int
    image_count: int
    stamp_heuristic: bool
    ocr_confidence: float | None
    tables_found: int
    table_preview: str
    error: str | None
    duration_sec: float
    psm_used: int | None = None


@dataclass
class FileOutcome:
    path: str
    page_count: int
    md5: str | None
    metadata: dict[str, Any]
    pages: list[PageOutcome]
    file_error: str | None = None
    duration_sec: float = 0.0


@dataclass
class WarningRow:
    kind: str
    path: str
    detail: str
    page: int | None = None


@dataclass
class BatchOutcome:
    files: list[FileOutcome]
    warnings: list[WarningRow]
    started_ts: float = field(default_factory=_now)
    options_snapshot: dict[str, Any] = field(default_factory=dict)


def options_to_dict(o: ProcessOptions) -> dict[str, Any]:
    return asdict(o)


def open_pdf_authenticated(path: str, password: str | None) -> tuple[Any, str | None]:
    """Открывает PDF; при ошибке пароля возвращает (None, сообщение)."""
    if not FITZ_AVAILABLE or fitz is None:
        return None, "PyMuPDF не установлен"
    doc = fitz.open(path)
    if doc.needs_pass:
        pw = (password or "").strip()
        if not pw:
            doc.close()
            return None, "Требуется пароль"
        try:
            rc = doc.authenticate(pw)
        except Exception:
            rc = 0
        if not rc:
            doc.close()
            return None, "Неверный пароль"
    return doc, None


def md5_file(path: str, chunk: int = 1 << 20) -> str | None:
    h = hashlib.md5()
    try:
        with open(path, "rb") as f:
            while True:
                b = f.read(chunk)
                if not b:
                    break
                h.update(b)
        return h.hexdigest()
    except Exception:
        return None


def _page_rect_area(r: fitz.Rect) -> float:
    return float(r.width * r.height) if r else 0.0


def _stamp_heuristic(page: fitz.Page) -> bool:
    """Крупное изображение в нижней части страницы или аннотация типа Stamp/Sig."""
    try:
        page_area = _page_rect_area(page.rect) or 1.0
        pr = page.rect
        bottom_zone_top = pr.y0 + pr.height * 0.65
        for annot in page.annots() or []:
            try:
                name = (annot.type[1] or "").lower()
                if "stamp" in name or "sig" in name or "widget" in name or "caret" in name:
                    return True
            except Exception:
                continue
        for info in page.get_images(full=True) or []:
            xref = info[0]
            try:
                for bx in page.get_image_rects(xref) or []:
                    if bx.y0 >= bottom_zone_top and _page_rect_area(bx) > 0.05 * page_area:
                        return True
            except Exception:
                continue
    except Exception:
        pass
    return False


def _annotation_summary(page: fitz.Page) -> tuple[str, int]:
    types: list[str] = []
    n = 0
    try:
        for annot in page.annots() or []:
            n += 1
            try:
                types.append(str(annot.type[1] or "?"))
            except Exception:
                types.append("?")
    except Exception:
        pass
    # уникальные, коротко
    uniq = []
    for t in types:
        if t not in uniq:
            uniq.append(t)
    return (", ".join(uniq[:8]) + ("…" if len(uniq) > 8 else ""), n)


def _count_images(page: fitz.Page) -> int:
    try:
        return len(page.get_images(full=True) or [])
    except Exception:
        return 0


def _native_text(page: fitz.Page) -> str:
    try:
        return (page.get_text("text") or "").strip()
    except Exception:
        return ""


def _preprocess_pil(img: Image.Image, o: ProcessOptions) -> Image.Image:
    if Image is None:
        return img
    im = img
    if o.rotate_extra and o.rotate_extra in (90, 180, 270):
        im = im.rotate(-o.rotate_extra, expand=True)
    if o.crop_margins_pct and 0 < o.crop_margins_pct <= 20:
        w, h = im.size
        m = int(min(w, h) * (o.crop_margins_pct / 100.0))
        if m > 0 and w - 2 * m > 10 and h - 2 * m > 10:
            im = im.crop((m, m, w - m, h - m))
    if o.preprocess_grayscale:
        im = im.convert("L")
    if o.preprocess_binarize and im.mode != "L":
        im = im.convert("L")
    if o.preprocess_binarize and Image is not None:
        # Простой порог; без numpy
        t = 128
        im = im.point(lambda p: 255 if p > t else 0)
    if o.preprocess_grayscale and ImageOps is not None and not o.preprocess_binarize:
        try:
            im = ImageOps.autocontrast(im)
        except Exception:
            pass
    return im


def _ocr_pil(
    img: Image.Image,
    o: ProcessOptions,
) -> tuple[str, float | None, int]:
    if not TESSERACT_AVAILABLE or pytesseract is None:
        return "", None, o.psm
    cfg = f"--psm {int(o.psm)} --oem {int(o.oem)}"
    try:
        txt = (pytesseract.image_to_string(img, lang=o.lang, config=cfg) or "").strip()
    except Exception:
        return "", None, o.psm
    conf: float | None = None
    try:
        data = pytesseract.image_to_data(img, lang=o.lang, config=cfg, output_type=pytesseract.Output.DICT)
        confs = [int(c) for c in data.get("conf", []) if str(c).lstrip("-").isdigit() and int(c) >= 0]
        if confs:
            conf = sum(confs) / max(len(confs), 1)
    except Exception:
        pass
    return txt, conf, o.psm


def _pixmap_to_pil(pix: fitz.Pixmap) -> Image.Image | None:
    if Image is None:
        return None
    try:
        if pix.alpha:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    except Exception:
        return None


def extract_tables_page(path: str, page_index: int, password: str | None) -> tuple[int, str]:
    if not PDFPLUMBER_AVAILABLE or pdfplumber is None:
        return 0, ""
    try:
        with pdfplumber.open(path, password=password or "") as pdf:
            if page_index >= len(pdf.pages):
                return 0, ""
            p = pdf.pages[page_index]
            tabs = p.extract_tables() or []
            n = len(tabs)
            if not n:
                return 0, ""
            preview = ""
            t0 = tabs[0]
            if t0 and len(t0) > 0 and t0[0]:
                preview = " | ".join(str(c) if c is not None else "" for c in t0[0][:6])
            if len(preview) > 200:
                preview = preview[:200] + "…"
            return n, preview
    except Exception:
        return 0, ""


def process_one_page(
    path: str,
    page_index: int,
    password: str | None,
    o: ProcessOptions,
    extract_tables: bool,
) -> PageOutcome:
    t0 = _now()
    err: str | None = None
    if not FITZ_AVAILABLE or fitz is None:
        return PageOutcome(
            path, page_index, "empty", "", "", 0, "", "", 0, 0, False, None, 0, "", "PyMuPDF не установлен", 0.0
        )
    doc, derr = open_pdf_authenticated(path, password)
    if doc is None:
        return PageOutcome(
            path,
            page_index,
            "empty",
            "",
            "",
            0,
            "",
            "",
            0,
            0,
            False,
            None,
            0,
            "",
            derr or "Не удалось открыть PDF",
            _now() - t0,
        )
    try:
        page = doc[page_index]
        native = _native_text(page)
        ann_s, ann_n = _annotation_summary(page)
        img_n = _count_images(page)
        stamp = _stamp_heuristic(page)

        need_ocr = False
        if o.preset == "ocr_always":
            need_ocr = True
        elif o.preset == "native":
            need_ocr = False
        else:
            need_ocr = len(native) < o.min_chars_native

        text = native
        source = "native"
        ocr_conf: float | None = None
        psm_u: int | None = None

        if need_ocr and TESSERACT_AVAILABLE:
            mat = fitz.Matrix(o.dpi_render / 72.0, o.dpi_render / 72.0)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            pil = _pixmap_to_pil(pix)
            pix = None
            if pil is not None:
                pil = _preprocess_pil(pil, o)
                ocr_txt, ocr_conf, psm_u = _ocr_pil(pil, o)
                if o.preset == "ocr_always":
                    text = ocr_txt
                    source = "ocr"
                elif not native:
                    text = ocr_txt
                    source = "ocr"
                else:
                    text = (ocr_txt if len(ocr_txt) >= len(native) else native)
                    if native and ocr_txt and ocr_txt != native:
                        source = "mixed"
                    elif ocr_txt:
                        source = "ocr"
                    else:
                        source = "native"
            else:
                err = err or "Не удалось получить изображение страницы"
        elif need_ocr and not TESSERACT_AVAILABLE:
            text = native
            source = "native" if native else "empty"
            err = err or "Tesseract/pytesseract недоступен для OCR"

        if not text.strip():
            source = "empty"

        tc = len(text)
        prev = text.replace("\r", " ").replace("\n", " ").strip()
        if len(prev) > 400:
            prev = prev[:400] + "…"

        t_n = 0
        t_prev = ""
        if extract_tables:
            t_n, t_prev = extract_tables_page(path, page_index, password)

        return PageOutcome(
            path=path,
            page_index=page_index,
            source=source,
            text=text,
            native_text=native,
            char_count=tc,
            preview=prev,
            annotation_types=ann_s,
            annotation_count=ann_n,
            image_count=img_n,
            stamp_heuristic=stamp,
            ocr_confidence=ocr_conf,
            tables_found=t_n,
            table_preview=t_prev,
            error=err,
            duration_sec=_now() - t0,
            psm_used=psm_u,
        )
    except Exception as ex:
        return PageOutcome(
            path,
            page_index,
            "empty",
            "",
            "",
            0,
            "",
            "",
            0,
            0,
            False,
            None,
            0,
            "",
            str(ex),
            _now() - t0,
        )
    finally:
        try:
            doc.close()
        except Exception:
            pass


def process_file(
    path: str,
    o: ProcessOptions,
    password: str | None,
    cancel_event: threading.Event | None,
    extract_tables: bool,
    parallel_pages: bool,
    on_page_done: Callable[[int, int], None] | None = None,
) -> FileOutcome:
    """Обрабатывает один PDF; on_page_done(current+1, total) при завершении страницы."""
    t_file = _now()
    if not FITZ_AVAILABLE:
        return FileOutcome(path, 0, None, {}, [], "PyMuPDF (fitz) не установлен", _now() - t_file)
    path = os.path.abspath(path)
    md5 = md5_file(path)
    meta: dict[str, Any] = {}
    pages_out: list[PageOutcome] = []
    file_err: str | None = None

    try:
        doc, derr = open_pdf_authenticated(path, password)
        if doc is None:
            return FileOutcome(path, 0, md5, {}, [], derr or "Не удалось открыть файл", _now() - t_file)
        try:
            meta = dict(doc.metadata or {})
        except Exception:
            meta = {}
        n_pages = doc.page_count
        doc.close()
    except Exception as e:
        return FileOutcome(path, 0, md5, {}, [], str(e), _now() - t_file)

    limit = n_pages
    if o.max_pages is not None and o.max_pages > 0:
        limit = min(limit, o.max_pages)

    indices = list(range(limit))

    def run_index(pi: int) -> PageOutcome:
        if cancel_event and cancel_event.is_set():
            return PageOutcome(
                path,
                pi,
                "empty",
                "",
                "",
                0,
                "",
                "",
                0,
                0,
                False,
                None,
                0,
                "",
                "Отменено",
                0.0,
            )
        return process_one_page(path, pi, password, o, extract_tables)

    if parallel_pages and max(1, o.max_workers) > 1 and len(indices) > 1:
        workers = max(1, min(o.max_workers, len(indices), 8))
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(run_index, i): i for i in indices}
            tmp: dict[int, PageOutcome] = {}
            for fut in as_completed(futs):
                i = futs[fut]
                try:
                    tmp[i] = fut.result()
                except Exception as ex2:
                    tmp[i] = PageOutcome(
                        path,
                        i,
                        "empty",
                        "",
                        "",
                        0,
                        "",
                        "",
                        0,
                        0,
                        False,
                        None,
                        0,
                        "",
                        str(ex2),
                        0.0,
                    )
                if on_page_done:
                    try:
                        on_page_done(len(tmp), limit)
                    except Exception:
                        pass
            pages_out = [tmp[i] for i in sorted(tmp.keys())]
    else:
        for i in indices:
            if cancel_event and cancel_event.is_set():
                pages_out.append(
                    PageOutcome(
                        path,
                        i,
                        "empty",
                        "",
                        "",
                        0,
                        "",
                        "",
                        0,
                        0,
                        False,
                        None,
                        0,
                        "",
                        "Отменено",
                        0.0,
                    )
                )
                break
            pages_out.append(run_index(i))
            if on_page_done:
                try:
                    on_page_done(len(pages_out), limit)
                except Exception:
                    pass
            if pages_out[-1].error and o.stop_on_error and "Отменено" not in (pages_out[-1].error or ""):
                break

    return FileOutcome(
        path=path,
        page_count=n_pages,
        md5=md5,
        metadata=meta,
        pages=pages_out,
        file_error=file_err,
        duration_sec=_now() - t_file,
    )


def process_paths(
    paths: list[str],
    o: ProcessOptions,
    passwords: dict[str, str | None],
    cancel_event: threading.Event | None,
    extract_tables: bool,
    parallel_pages: bool,
    on_file_start: Callable[[str, int, int], None] | None = None,
    on_page_progress: Callable[[str, int, int], None] | None = None,
) -> BatchOutcome:
    """paths — список файлов по порядку; passwords — map abspath -> password."""
    warnings: list[WarningRow] = []
    files: list[FileOutcome] = []
    if not TESSERACT_AVAILABLE:
        warnings.append(WarningRow("deps", "", "Tesseract/pytesseract недоступен: OCR отключён для пустых страниц."))
    if extract_tables and not PDFPLUMBER_AVAILABLE:
        warnings.append(WarningRow("deps", "", "pdfplumber не установлен: таблицы пропущены."))

    pw_map: dict[str, str | None] = {}
    for pth in paths:
        a = os.path.abspath(pth)
        if passwords:
            pw_map[a] = passwords.get(a)
        else:
            pw_map[a] = None

    def _make_page_cb(ap0: str) -> Callable[[int, int], None]:
        def page_cb(cur: int, tot: int) -> None:
            if on_page_progress:
                try:
                    on_page_progress(ap0, cur, tot)
                except Exception:
                    pass

        return page_cb

    total_files = len(paths)
    for fi, path in enumerate(paths):
        ap = os.path.abspath(path)
        if on_file_start:
            try:
                on_file_start(ap, fi + 1, total_files)
            except Exception:
                pass
        pw = pw_map.get(ap)
        fo = process_file(
            ap,
            o,
            pw,
            cancel_event,
            extract_tables,
            parallel_pages,
            on_page_done=_make_page_cb(ap),
        )
        files.append(fo)
        if fo.file_error:
            warnings.append(WarningRow("file", ap, fo.file_error))
        for pg in fo.pages:
            if pg.error and "Отменено" not in pg.error:
                warnings.append(WarningRow("page", ap, pg.error or "", pg.page_index + 1))
        if cancel_event and cancel_event.is_set():
            break

    return BatchOutcome(
        files=files,
        warnings=warnings,
        options_snapshot=options_to_dict(o),
    )


def build_searchable_pdf(
    src_path: str,
    out_path: str,
    o: ProcessOptions,
    password: str | None,
) -> tuple[bool, str]:
    """
    Экспериментальный searchable PDF: страница как растр + невидимый текст (render_mode=3) по словам Tesseract.
    """
    if not FITZ_AVAILABLE or not TESSERACT_AVAILABLE or Image is None:
        return False, "Нужны PyMuPDF, Pillow и Tesseract"
    try:
        src, s_err = open_pdf_authenticated(src_path, password)
        if src is None:
            return False, s_err or "Не удалось открыть"
        dst = fitz.open()
        mat = fitz.Matrix(o.dpi_render / 72.0, o.dpi_render / 72.0)
        for i in range(src.page_count):
            page = src[i]
            pix = page.get_pixmap(matrix=mat, alpha=False)
            pil = _pixmap_to_pil(pix)
            pix = None
            if pil is None:
                continue
            pil = _preprocess_pil(pil, o)
            w, h = pil.size
            npage = dst.new_page(width=float(w), height=float(h))
            img_bytes = io.BytesIO()
            pil.save(img_bytes, format="PNG")
            img_bytes.seek(0)
            npage.insert_image(npage.rect, stream=img_bytes.read())
            cfg = f"--psm {int(o.psm)} --oem {int(o.oem)}"
            try:
                tsv = pytesseract.image_to_data(pil, lang=o.lang, config=cfg, output_type=pytesseract.Output.DICT)
                n = len(tsv.get("text", []))
                for j in range(n):
                    tx = (tsv["text"][j] or "").strip()
                    if not tx:
                        continue
                    try:
                        conf = int(tsv["conf"][j])
                    except Exception:
                        conf = -1
                    if conf < 0:
                        continue
                    left = int(tsv["left"][j])
                    top = int(tsv["top"][j])
                    th = max(8, int(tsv["height"][j]))
                    # Масштаб: pil соответствует размеру страницы new page = w,h — координаты tesseract совпадают
                    try:
                        npage.insert_text(
                            (float(left), float(top + th * 0.75)),
                            tx,
                            fontsize=float(max(6, min(th, 24))),
                            render_mode=3,
                        )
                    except Exception:
                        pass
            except Exception:
                pass
        dst.save(out_path)
        dst.close()
        src.close()
        return True, ""
    except Exception as e:
        return False, str(e)


def fix_imports_message() -> str:
    parts = []
    if not FITZ_AVAILABLE:
        parts.append("pip install pymupdf")
    parts.append("pip install Pillow pytesseract openpyxl python-docx")
    return "\n".join(parts)
