# -*- coding: utf-8 -*-
"""
ИД — два шага: (1) добавить проект PDF → импорт в базу, OCR пустых страниц, извлечение шифра;
(2) сформировать комплект ИД по шаблонам и образцу (реестр, титул, manifest).

Параметры образца и реестра — «Данные/комплект_id.json». Lineage — «Данные/lineage_last.json».
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import threading
import tkinter as tk
from pathlib import Path
from typing import Any
from tkinter import filedialog, messagebox, ttk

_UTIL_DIR = Path(__file__).resolve().parent
_ЯДРО = (_UTIL_DIR.parent.parent / "Ядро").resolve()
_CACHE = _UTIL_DIR / "__pycache__"
_DEFAULT_DB = _UTIL_DIR / "Данные" / "текущий_проект_рд.sqlite"

_RD_STEMS = ("rd_export", "rd_extract", "rd_project")
_rd_loaded = False


def _ensure_paths() -> None:
    for p in (str(_ЯДРО), str(_UTIL_DIR)):
        if p not in sys.path:
            sys.path.insert(0, p)


def _pyc_for_stem(stem: str) -> Path:
    hits = sorted(_CACHE.glob(f"{stem}*.pyc"))
    if len(hits) != 1:
        raise FileNotFoundError(f"Ожидался один {stem}*.pyc в {_CACHE}, найдено {len(hits)}.")
    return hits[0]


def _preload_rd_bytecode() -> None:
    global _rd_loaded
    if _rd_loaded:
        return
    for stem in _RD_STEMS:
        if stem in sys.modules:
            continue
        pyc = _pyc_for_stem(stem)
        spec = importlib.util.spec_from_file_location(stem, pyc)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Не удалось загрузить {pyc}")
        mod = importlib.util.module_from_spec(spec)
        sys.modules[stem] = mod
        spec.loader.exec_module(mod)
    _rd_loaded = True


def _ensure_rd_loaded() -> None:
    _ensure_paths()
    _preload_rd_bytecode()


def _собрать_черновик_ид(conn, rp, rx) -> str:
    rx.ensure_fallback_tables_for_existing_pages(conn, rp)
    snap = rp.export_snapshot_dict(conn)
    meta = snap["meta"]

    lines: list[str] = []
    lines.append("ДИАГНОСТИКА ПРОЕКТА РД (SQLite)")
    lines.append("")
    lines.append(f"Шифр в метаданных: {meta.get('object_cipher') or '—'}")
    lines.append(f"Название в метаданных: {meta.get('title') or '—'}")
    notes = str(meta.get("notes") or "").strip()
    if notes:
        lines.append(f"Заметки: {notes}")
    lines.append("")

    pages_total = 0
    pages_empty = 0
    chars_total = 0
    tables_nonempty = 0

    for doc in snap.get("documents") or []:
        fn = str(doc.get("filename") or "")
        lines.append(f"  • {fn}  (стр.: {doc.get('page_count')})")
        for page in doc.get("pages") or []:
            pages_total += 1
            cc = int(page.get("char_count") or 0)
            chars_total += cc
            if cc == 0:
                pages_empty += 1
            qual = str(page.get("quality") or "")
            for tbl in page.get("tables") or []:
                rows_json = tbl.get("rows")
                if not isinstance(rows_json, list):
                    rows_json = tbl.get("rows_json")
                if isinstance(rows_json, str):
                    try:
                        rows_json = json.loads(rows_json or "[]")
                    except Exception:
                        rows_json = []
                if isinstance(rows_json, list) and rows_json:
                    tables_nonempty += 1

    lines.append("")
    lines.append(f"Страниц всего: {pages_total} | символов текста: {chars_total} | пустых страниц: {pages_empty}")
    lines.append(f"Таблиц с данными: {tables_nonempty}")

    if pages_total and pages_empty == pages_total and chars_total == 0:
        lines.append("")
        lines.append("Внимание: текст не извлечён — для сканов установите Tesseract и pytesseract (см. УСТАНОВКА.txt).")

    return "\n".join(lines)


def запустить(родитель: tk.Misc) -> None:
    _ensure_rd_loaded()
    import rd_export as rd_exp  # type: ignore
    import rd_extract as rd_ext  # type: ignore
    import rd_project as rd_pr  # type: ignore

    ПриложениеИД(родитель, rd_pr, rd_ext, rd_exp).построить()


class ПриложениеИД:
    def __init__(self, родитель: tk.Misc, rd_pr, rd_ext, rd_exp) -> None:
        self.родитель = родитель
        self.rp = rd_pr
        self.rx = rd_ext
        self.rexp = rd_exp
        self.conn = None
        self._db_path = _DEFAULT_DB
        self.out: tk.Text | None = None
        self.title_lbl: ttk.Label | None = None
        self._last_pdf_paths: list[Path] = []
        self._ocr_pages_session = 0

    def _rep_tab(self, on: bool) -> None:
        fn = getattr(self.родитель, "report_tab_error", None)
        if callable(fn):
            try:
                fn(bool(on))
            except Exception:
                pass

    def _hub_err(self, msg: str) -> None:
        fn = getattr(self.родитель, "hub_log_error", None)
        if callable(fn):
            try:
                fn(msg)
            except Exception:
                pass

    def _connect(self) -> bool:
        try:
            os.makedirs(self._db_path.parent, exist_ok=True)
            if self.conn is not None:
                try:
                    self.conn.close()
                except Exception:
                    pass
            self.conn = self.rp.open_or_create_project(str(self._db_path))
            return True
        except Exception as e:
            self._hub_err(str(e))
            messagebox.showerror("ИД", f"Не удалось открыть базу проекта:\n{e}", parent=self.родитель.winfo_toplevel())
            return False

    def _append_log(self, text: str) -> None:
        if self.out:
            self.out.insert(tk.END, text.rstrip() + "\n")
            self.out.see(tk.END)

    def _обновить_диагностику(self) -> None:
        if self.conn is None or self.out is None:
            return
        try:
            body = _собрать_черновик_ид(self.conn, self.rp, self.rx)
            meta = self.rp.get_meta(self.conn)
            if self.title_lbl is not None:
                t = str(meta.get("title") or "").strip()
                sh = str(meta.get("object_cipher") or "").strip()
                self.title_lbl.configure(text=f"База: {self._db_path.name}  |  шифр: {sh or '—'}  |  {t or ''}")
            self.out.delete("1.0", tk.END)
            self.out.insert("1.0", body)
            self._rep_tab(False)
        except Exception as e:
            self._rep_tab(True)
            self._hub_err(str(e))
            self._append_log(f"Ошибка диагностики: {e}")

    def построить(self) -> None:
        if _ЯДРО not in sys.path:
            sys.path.insert(0, str(_ЯДРО))
        import hub_theme as T  # type: ignore
        import оформление_утилиты as shell  # type: ignore

        if not self._connect():
            return

        _, inner = shell.карточка_утилиты(
            self.родитель,
            "ИД",
            "Шаг 1 — добавьте PDF проекта. Шаг 2 — сформируйте комплект (образец и реестр задаются в Данные/комплект_id.json).",
        )

        self.title_lbl = ttk.Label(inner, text="", style="MutedCard.TLabel")
        self.title_lbl.pack(anchor=tk.W, pady=(0, 8))

        bar = tk.Frame(inner, bg=T.CARD)
        bar.pack(fill=tk.X, pady=(0, 8))

        def btn(txt: str, cmd) -> None:
            b = ttk.Button(bar, text=txt, command=cmd)
            b.pack(side=tk.LEFT, padx=(0, 10))

        btn("1. Добавить проект (PDF)…", self._добавить_pdf)
        btn("2. Сформировать комплект ИД…", self._сформировать_комплект)

        wrap = tk.Frame(inner, bg=T.CARD)
        wrap.pack(fill=tk.BOTH, expand=True)
        sb = ttk.Scrollbar(wrap, orient=tk.VERTICAL)
        sb.pack(side=tk.RIGHT, fill=tk.Y)
        self.out = tk.Text(
            wrap,
            height=26,
            wrap=tk.WORD,
            font=T.FONT_MONO,
            yscrollcommand=sb.set,
            bg=getattr(T, "TEXT_AREA_BG", T.CARD),
            fg=T.TEXT,
            insertbackground=T.TEXT,
            selectbackground=T.SIDEBAR_SELECT_BG,
            selectforeground=T.SIDEBAR_SELECT_FG,
            highlightthickness=0,
            borderwidth=0,
        )
        self.out.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        sb.config(command=self.out.yview)

        self.родитель.winfo_toplevel().after_idle(self._обновить_диагностику)

    def _добавить_pdf(self) -> None:
        top = self.родитель.winfo_toplevel()
        paths = filedialog.askopenfilenames(parent=top, title="PDF проекта (можно несколько)", filetypes=[("PDF", "*.pdf")])
        if not paths:
            return
        self._last_pdf_paths = [Path(p) for p in paths]
        db_path = str(self._db_path)
        импорт_paths = list(self._last_pdf_paths)

        self._append_log("— Импорт PDF…")

        def work() -> None:
            import id_pipeline  # type: ignore

            try:
                log_lines: list[str] = []
                conn = self.rp.open_or_create_project(db_path)
                for p in импорт_paths:
                    self.rx.extract_pdf_to_project(conn, str(p), rd_project_mod=self.rp, replace_if_exists=True)
                self.rx.ensure_fallback_tables_for_existing_pages(conn, self.rp)
                n_ocr, ocr_msgs = id_pipeline.применить_ocr_к_пустым_страницам(conn, self.rp)
                lineage: dict[str, Any] = {}
                stems = " ".join(x.stem for x in импорт_paths)
                ex_fn = id_pipeline.извлечь_поля_из_текста(stems, lineage)
                blob = id_pipeline.собрать_полный_текст(conn)
                ex_txt = id_pipeline.извлечь_поля_из_текста(blob, lineage)
                merged_ex = {**ex_fn, **ex_txt}
                title_guess = импорт_paths[0].stem[:240] if импорт_paths else None
                id_pipeline.обновить_метаданные_проекта(conn, self.rp, merged_ex.get("шифр"), title_guess)
                id_pipeline.сохранить_lineage(_UTIL_DIR, lineage)
                try:
                    conn.commit()
                except Exception:
                    pass
                conn.close()
                log_lines.extend(ocr_msgs)
                log_lines.append("Извлечено из текста/имён файлов:")
                log_lines.append(json.dumps(merged_ex, ensure_ascii=False, indent=2))
                top.after(0, lambda: self._после_импорта(True, "\n".join(log_lines), n_ocr))
            except Exception as e:
                top.after(0, lambda err=e: self._после_импорта(False, str(err), 0))

        threading.Thread(target=work, daemon=True).start()

    def _после_импорта(self, ok: bool, msg: str, ocr_n: int) -> None:
        self._ocr_pages_session = ocr_n
        self._append_log(msg)
        self._connect()
        self._обновить_диагностику()
        top = self.родитель.winfo_toplevel()
        if ok:
            messagebox.showinfo("ИД", "Проект добавлен. При необходимости проверьте Данные/lineage_last.json.", parent=top)
        else:
            self._rep_tab(True)
            self._hub_err(msg)
            messagebox.showerror("ИД", msg, parent=top)

    def _сформировать_комплект(self) -> None:
        import id_komplekt  # type: ignore
        import id_pipeline  # type: ignore

        top = self.родитель.winfo_toplevel()
        out_dir = filedialog.askdirectory(parent=top, title="Папка для комплекта ИД")
        if not out_dir:
            return

        if not self._connect():
            return

        cfg = id_komplekt.загрузить_конфиг(_UTIL_DIR)
        lineage: dict[str, Any] = {}
        pref = " ".join(p.stem for p in self._last_pdf_paths)
        if pref.strip():
            id_pipeline.извлечь_поля_из_текста(pref, lineage)
        blob = id_pipeline.собрать_полный_текст(self.conn)
        extr = id_pipeline.извлечь_поля_из_текста(blob, lineage)
        ix = cfg.get("извлечение") or {}
        merged = id_pipeline.слить_конфиг_с_извлечением(
            cfg,
            extr,
            lineage,
            перезаписать_шифр=bool(ix.get("перезаписывать_шифр", True)),
            основание_из_первого_номера=bool(ix.get("основание_из_номера", False)),
        )

        try:
            m = self.rp.get_meta(self.conn)
            oc = str(m.get("object_cipher") or "").strip()
            if oc and not str(merged.get("шифр") or "").strip():
                merged["шифр"] = oc
            tit = str(m.get("title") or "").strip()
            if tit and not str(merged.get("строительство_блок") or "").strip():
                merged["строительство_блок"] = tit
        except Exception:
            pass

        id_pipeline.сохранить_lineage(_UTIL_DIR, merged.get("_lineage") or lineage)

        errs, warns = id_pipeline.проверить_перед_комплектом(merged)
        if errs:
            self._rep_tab(True)
            msg_e = "\n".join(errs)
            self._hub_err(msg_e)
            messagebox.showerror("ИД", "Ошибка проверки:\n" + msg_e, parent=top)
            return

        manifest = id_pipeline.подготовить_manifest(
            merged,
            self._last_pdf_paths,
            errs,
            warns,
            self._ocr_pages_session,
        )

        ok, msg = id_komplekt.сформировать_комплект(_UTIL_DIR, Path(out_dir), merged, manifest=manifest)
        self._append_log(msg)
        if warns:
            self._append_log("Предупреждения:\n" + "\n".join(warns))

        if ok:
            self._rep_tab(False)
            wtxt = ("\n\nПредупреждения:\n" + "\n".join(warns)) if warns else ""
            messagebox.showinfo("ИД", msg + wtxt, parent=top)
            self._обновить_диагностику()
        else:
            self._rep_tab(True)
            self._hub_err(msg)
            messagebox.showerror("ИД", msg, parent=top)
