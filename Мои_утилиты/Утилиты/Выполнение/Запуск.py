# -*- coding: utf-8 -*-
"""КС-2: дашборд для руководства — выручка по месяцам, диаграммы; сохранение набора файлов."""

from __future__ import annotations

import json
import os
import queue
import sys
import textwrap
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import tkinter as tk
import tkinter.font as tkfont
from tkinter import filedialog, scrolledtext, ttk

_утил_dir = os.path.dirname(os.path.abspath(__file__))
_ядро = os.path.normpath(os.path.join(_утил_dir, "..", "..", "Ядро"))
_данные_dir = os.path.join(_утил_dir, "Данные")
_сессия_json = os.path.join(_данные_dir, "сессия_кс2.json")

if _утил_dir not in sys.path:
    sys.path.insert(0, _утил_dir)
if _ядро not in sys.path:
    sys.path.insert(0, _ядро)

import hub_theme as _T  # type: ignore
import кс2_разбор as _ks2  # type: ignore
import оформление_утилиты as _shell  # type: ignore

_DASH_CHART_BG = _T.DASH_CHART_BG
_DASH_AXIS = _T.DASH_AXIS_TEXT
_DASH_MUTED = _T.DASH_MUTED_TEXT
_DASH_BORDER = _T.DASH_GRID
_DASH_EMPTY_HINT = "Добавьте файлы КС-2, чтобы построить дашборд.\nПосле разбора здесь появятся тренд и структура выручки."
# Спокойные цвета на тёмном фоне (согласованная гамма)
_BAR_PALETTE = ("#58b8ff", "#f0b849", "#b49cff", "#5eead4", "#fb923c", "#94a3b8", "#f472b6")
# Больше периодов — горизонтальные полосы нечитаемы; показываем линию времени.
_DASH_BARH_MAX_PERIODS = 14
# Полное кольцо с 40+ секторами и легендой нечитаемо: топ-N + «Прочее».
_PIE_MAX_SLICES = 12
_PARTIAL_UI_MIN_INTERVAL_SEC = 0.35

# Разделитель iid: «файл» / «файл + позиция сметы» (символ не встречается в путях Windows)
_TREE_IID_SEP = "\x1e"
_FILES_TREE_STYLE = "FilesKs2.Treeview"
_FILES_COL_WRAP = 72
_FILES_COL_MAXLINES = 3
_files_tree_cols = ("unit", "qty", "month", "bez_nds", "s_nds")

_AGENT_DEBUG_LOG_KS2 = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "debug-b66d0a.log"))
_DEBUG_LOG_PATH_RUNTIME = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "debug-1b1da5.log"))


def _agent_log_ks2(hypothesis_id: str, location: str, message: str, data: dict | None = None) -> None:
    #region agent log
    try:
        payload = {
            "sessionId": "b66d0a",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(__import__("time").time() * 1000),
        }
        with open(_AGENT_DEBUG_LOG_KS2, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
    #endregion


def _runtime_dbg_log(hypothesis_id: str, location: str, message: str, data: dict | None = None, run_id: str = "initial") -> None:
    #region agent log
    try:
        payload = {
            "sessionId": "1b1da5",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(time.time() * 1000),
        }
        with open(_DEBUG_LOG_PATH_RUNTIME, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
    #endregion


def _краткая_сума_mln(x: float) -> str:
    """Подпись к столбцу без научной нотации: «6,1 млн ₽» или тысячи."""
    if x <= 0:
        return "0 ₽"
    absx = abs(x)
    if absx >= 1_000_000:
        t = x / 1_000_000
        body = f"{t:.2f}".rstrip("0").rstrip(".").replace(".", ",")
        if not body:
            body = "0"
        return f"{body} млн ₽"
    if absx >= 1000:
        return f"{int(round(x)):,}".replace(",", " ") + " ₽"
    return f"{x:,.0f}".replace(",", " ") + " ₽"


def _ось_rub_formatter(v: float, _pos: int) -> str:
    v = float(v)
    av = abs(v)
    if av >= 1_000_000 and av < 10_000_000:
        return f"{v/1_000_000:.1f}".replace(".", ",") + " млн"
    if av >= 1_000_000:
        return f"{v/1_000_000:.0f} млн"
    if av >= 1000:
        return f"{int(round(v/1000))} тыс"
    return f"{int(round(v))}"


def _подпись_месяца_компакт(год: int, месяц: int) -> str:
    """Короткая подпись для оси X при многих точках: «07.25»."""
    if not (1 <= месяц <= 12):
        return f"{месяц:02d}.{год % 100:02d}"
    return f"{месяц:02d}.{год % 100:02d}"


def _индексы_равномерных_меток(n: int, max_labels: int = 12) -> list[int]:
    if n <= 0:
        return []
    if n <= max_labels:
        return list(range(n))
    if max_labels < 2:
        return [0]
    # Ровно max_labels отметок, крайние — первый и последний месяц
    pos = [round(i * (n - 1) / (max_labels - 1)) for i in range(max_labels)]
    return sorted({int(p) for p in pos})


def _агрегировать_секторы_пирога(
    vals: list[float],
    labs: list[str],
    max_slices: int,
) -> tuple[list[float], list[str], str]:
    if len(vals) <= max_slices:
        return vals, labs, ""
    pairs = sorted(zip(vals, labs), key=lambda x: -x[0])
    keep = max_slices - 1
    top = pairs[:keep]
    rest = pairs[keep:]
    s_rest = float(sum(v for v, _ in rest))
    pv = [float(v) for v, _ in top] + [s_rest]
    pl = [lb for _, lb in top] + [f"Прочее · {len(rest)} кат."]
    note = f"топ {keep} по сумме + «Прочее»"
    return pv, pl, note


def _тип_работ_по_названию(name: str) -> str:
    t = (name or "").lower().replace("ё", "е")
    if any(k in t for k in ("антикор", "акз", "окраск", "лакокрас", "грунт", "эмаль", "покрыт")):
        return "Антикоррозийные работы"
    if any(k in t for k in ("изоляц", "утепл", "isotec", "isover", "минераловат", "теплоизоляц")):
        return "Теплоизоляционные работы"
    if any(k in t for k in ("монтаж труб", "трубопровод", "сварк", "стык", "укладк труб", "врезк", "труба")):
        return "Монтаж трубы"
    return "Прочие работы"


def _выручка_по_видам_работ(docs: list[_ks2.РезультатДокумента]) -> dict[str, float]:
    out: dict[str, float] = {
        "Антикоррозийные работы": 0.0,
        "Теплоизоляционные работы": 0.0,
        "Монтаж трубы": 0.0,
        "Прочие работы": 0.0,
    }
    for d in docs:
        if d.ошибка:
            continue
        line_pairs: list[tuple[str, float]] = []
        for r in d.строки:
            if r.сумма is None:
                continue
            v = float(r.сумма)
            if abs(v) < 0.0001:
                continue
            line_pairs.append((r.наименование, v))
        if not line_pairs:
            for n in d.узлы_позиций:
                if n.сумма is None:
                    continue
                v = float(n.сумма)
                if abs(v) < 0.0001:
                    continue
                line_pairs.append((n.название, v))

        if line_pairs:
            for nm, sv in line_pairs:
                out[_тип_работ_по_названию(nm)] += sv
            continue

        # fallback: если строковых сумм нет, относим весь документ к доминирующему типу
        basis = " ".join([d.фрагмент, d.имя] + [x.название for x in d.узлы_позиций[:20]])
        typ = _тип_работ_по_названию(basis)
        out[typ] += float(d.выручка_по_документу or 0.0)
    return out


def _путь_сессии() -> str:
    return _сессия_json


def _загрузить_сохранённые_пути() -> list[str]:
    path = _путь_сессии()
    if not os.path.isfile(path):
        return []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    raw = data.get("paths") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for p in raw:
        if not isinstance(p, str):
            continue
        q = os.path.normpath(p)
        if os.path.isfile(q) and q not in out:
            out.append(q)
    return out


def _сохранить_пути(paths: list[str]) -> None:
    try:
        os.makedirs(_данные_dir, exist_ok=True)
        with open(_путь_сессии(), "w", encoding="utf-8") as f:
            json.dump({"paths": paths}, f, ensure_ascii=False, indent=0)
    except Exception:
        pass


def _колонка_периода(d: _ks2.РезультатДокумента) -> str:
    if d.ошибка:
        return "ошибка"
    if d.период_дата:
        y, mo, da = d.период_дата
        return f"{da:02d}.{mo:02d}.{y:04d}"
    return "—"


def _колонка_месяц(d: _ks2.РезультатДокумента) -> str:
    if d.ошибка or not d.период_дата:
        return "—"
    mo_list = d.месяцы_распределения_выручки
    if len(mo_list) > 1:
        sorted_m = sorted({(y, m) for y, m in mo_list})
        a, b = sorted_m[0], sorted_m[-1]
        if a == b:
            return f"{a[1]:02d}.{a[0]:04d}"
        return f"{a[1]:02d}.{a[0]:04d}–{b[1]:02d}.{b[0]:04d}"
    y, mo, _ = d.период_дата
    return f"{mo:02d}.{y:04d}"


def _fmt_money_rub(x: float) -> str:
    if abs(x - round(x)) < 0.005:
        body = f"{int(round(x)):,}".replace(",", " ")
    else:
        body = f"{x:,.2f}".replace(",", " ")
    return f"{body} ₽"


def _fmt_percent(x: float) -> str:
    return f"{x:.1f}%".replace(".", ",")


def _деньги_колонка(x: float | None) -> str:
    if x is None:
        return "—"
    return _fmt_money_rub(float(x))


def _перенос_для_дерева(
    s: str,
    width: int = _FILES_COL_WRAP,
    max_lines: int = _FILES_COL_MAXLINES,
) -> str:
    s = (s or "").replace("\r", " ").replace("\n", " ").strip()
    if not s:
        return ""
    lines = textwrap.wrap(s, width=max(12, int(width)), break_long_words=True, break_on_hyphens=False)
    if max_lines and max_lines > 0 and len(lines) > max_lines:
        lines = lines[:max_lines]
    return "\n".join(lines)


def _файл_из_iid_дерева(iid: str) -> str:
    return iid.split(_TREE_IID_SEP, 1)[0] if _TREE_IID_SEP in iid else iid


def _путь_колонок_дерева_кс2() -> str:
    return os.path.join(_данные_dir, "дерево_файлов_кс2_колонки.json")


def _загрузить_ширины_колонок_дерева() -> dict[str, int]:
    path = _путь_колонок_дерева_кс2()
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    raw = data.get("cols") if isinstance(data, dict) else None
    if not isinstance(raw, dict):
        return {}
    out: dict[str, int] = {}
    for k, v in raw.items():
        if isinstance(k, str) and isinstance(v, (int, float)):
            out[k] = int(v)
    return out


def _сохранить_ширины_колонок_дерева(tree: ttk.Treeview) -> None:
    cols: dict[str, int] = {}
    for cid in ("#0",) + tuple(_files_tree_cols):
        try:
            cols[cid] = int(tree.column(cid, "width"))
        except (tk.TclError, TypeError, ValueError):
            pass
    if not cols:
        return
    try:
        os.makedirs(_данные_dir, exist_ok=True)
        with open(_путь_колонок_дерева_кс2(), "w", encoding="utf-8") as f:
            json.dump({"cols": cols}, f, ensure_ascii=False, indent=0)
    except Exception:
        pass


def _строка_значений_корня_файла(d: _ks2.РезультатДокумента | None) -> tuple[str, ...]:
    def _short_status(doc: _ks2.РезультатДокумента) -> str:
        if doc.ошибка:
            return "ошибка"
        notes: list[str] = []
        if not doc.период_дата:
            notes.append("нет даты")
        if not doc.строки:
            notes.append("нет таблицы")
        if doc.выручка_по_документу is None:
            notes.append("нет суммы")
        if notes:
            return " / ".join(notes[:2])
        return "ok"

    if d is None:
        return ("", "", "—", "—", "—")
    if d.ошибка:
        return ("", "", "—", "—", "—")
    return (
        "",
        "",
        _колонка_месяц(d),
        _деньги_колонка(d.доход_без_ндс),
        _деньги_колонка(d.доход_с_ндс),
    )


def _текст_узла_сметы(н: _ks2.УзелПозицииКс2, *, wrap_width: int, max_lines: int = 3) -> str:
    prefix = {
        "раздел": "▸ ",
        "работа": "◇ ",
        "материал": "  · ",
        "строка": "○ ",
        "прочее": "",
    }.get(н.тип, "")
    return _перенос_для_дерева(prefix + н.название, width=wrap_width, max_lines=max_lines)


def _развернуть_ветку_дерева(tv: ttk.Treeview, root: str) -> None:
    try:
        tv.item(root, open=True)
    except tk.TclError:
        return
    for ch in tv.get_children(root):
        _развернуть_ветку_дерева(tv, ch)


def запустить(родитель: tk.Misc) -> None:
    #region agent log
    _agent_log_ks2("H1", "Запуск.запустить", "enter", {})
    #endregion
    t_card0 = __import__("time").perf_counter()
    _, inner = _shell.карточка_утилиты(
        родитель,
        "",
        "",
    )
    #region agent log
    _agent_log_ks2(
        "H3",
        "Запуск.запустить",
        "after_card_shell",
        {"elapsed_ms": int((__import__("time").perf_counter() - t_card0) * 1000)},
    )
    #endregion

    files: list[str] = _загрузить_сохранённые_пути()
    saved_docs_map: dict[str, _ks2.РезультатДокумента] = {}
    #region agent log
    _runtime_dbg_log("H1", "Запуск.запустить", "files_loaded_on_open", {"n_files": len(files)})
    #endregion
    last_run: tuple[list[_ks2.РезультатДокумента], list[_ks2.СводкаМесяца]] | None = None
    _analysis_busy = [False]
    _analysis_pending = [False]
    _partial_last_ui_ts = [0.0]
    _run_reason = ["unknown"]

    mpl_canvas = None  # type: ignore[assignment]
    ax_bar = None  # type: ignore[assignment]
    ax_pie = None  # type: ignore[assignment]

    def log_err(msg: str) -> None:
        if callable(getattr(родитель, "hub_log_error", None)):
            try:
                родитель.hub_log_error(msg)
            except Exception:
                pass
        else:
            try:
                getattr(родитель, "report_tab_error", lambda _: None)(True)
            except Exception:
                pass

    def clear_err() -> None:
        if callable(getattr(родитель, "hub_clear_error", None)):
            try:
                родитель.hub_clear_error()
            except Exception:
                pass

    def persist() -> None:
        _сохранить_пути(list(files))

    def _doc_id(d: _ks2.РезультатДокумента) -> str:
        return _ks2.получить_хэш_результата(d)

    def _reload_saved_docs() -> list[_ks2.РезультатДокумента]:
        nonlocal saved_docs_map
        docs = _ks2.получить_все_сохраненные()
        saved_docs_map = {_doc_id(d): d for d in docs}
        return docs

    if os.path.isfile(_путь_сессии()):
        _сохранить_пути(list(files))

    nb = ttk.Notebook(inner)
    nb.pack(fill=tk.BOTH, expand=True, pady=(0, 4))

    tab_ov = tk.Frame(nb, bg=_T.CARD)
    tab_files = tk.Frame(nb, bg=_T.CARD)
    nb.add(tab_ov, text="  Обзор  ")
    nb.add(tab_files, text="  Файлы КС-2  ")

    def build_kpi(parent: tk.Frame) -> tuple[tk.Frame, tk.Label, tk.Label, tk.Label, tk.Label]:
        kpi_wrap = tk.Frame(parent, bg=_T.CARD)
        kpi_wrap.pack(fill=tk.X, pady=(0, 12))

        def _kpi_tile(tile_parent: tk.Frame, *, title: str) -> tk.Label:
            card = tk.Frame(
                tile_parent,
                bg=_T.TEXT_FIELD_BG,
                highlightthickness=1,
                highlightbackground=_T.ACCENT_DIM,
            )
            card.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=4)
            tk.Label(card, text=title, font=_T.FONT_CAPTION, fg=_T.TEXT_DIM, bg=_T.TEXT_FIELD_BG).pack(
                anchor=tk.W,
                padx=12,
                pady=(10, 2),
            )
            val = tk.Label(card, text="—", font=_T.FONT_HEAD, fg=_T.ACCENT, bg=_T.TEXT_FIELD_BG)
            val.pack(anchor=tk.W, padx=12, pady=(0, 10))
            return val

        money = _kpi_tile(kpi_wrap, title="Выручка по КС‑2 (итог по акту)")
        docs = _kpi_tile(kpi_wrap, title="Актов в наборе")
        months = _kpi_tile(kpi_wrap, title="Учитываемых периодов (месяцев)")
        status = tk.Label(
            parent,
            text="Набор не загружен",
            font=_T.FONT_CAPTION,
            fg=_T.TEXT_DIM,
            bg=_T.CARD,
            anchor=tk.W,
            justify=tk.LEFT,
        )
        status.pack(fill=tk.X, pady=(0, 8))
        return kpi_wrap, money, docs, months, status

    def build_month_table(parent: tk.Frame) -> ttk.Treeview:
        tk.Label(parent, text="Доход по месяцам", font=_T.FONT_TITLE, fg=_T.TEXT, bg=_T.CARD).pack(anchor=tk.W)
        tbl_wrap = tk.Frame(
            parent,
            bg=_T.CARD_ALT,
            highlightthickness=1,
            highlightbackground=_T.BORDER,
        )
        tbl_wrap.pack(fill=tk.BOTH, expand=True, pady=(8, 0))
        month_tree = ttk.Treeview(
            tbl_wrap,
            columns=("sum", "share"),
            show="tree headings",
            height=9,
            selectmode="browse",
        )
        month_tree.heading("#0", text="Месяц")
        month_tree.column("#0", width=160, anchor=tk.W)
        month_tree.heading("sum", text="Выручка")
        month_tree.column("sum", width=150, anchor=tk.E)
        month_tree.heading("share", text="Доля")
        month_tree.column("share", width=72, anchor=tk.E)
        ys_d = ttk.Scrollbar(tbl_wrap, orient=tk.VERTICAL, command=month_tree.yview)
        month_tree.configure(yscrollcommand=ys_d.set)
        month_tree.grid(row=0, column=0, sticky="nsew")
        ys_d.grid(row=0, column=1, sticky="ns")
        tbl_wrap.columnconfigure(0, weight=1)
        tbl_wrap.rowconfigure(0, weight=1)
        return month_tree

    def build_dashboard_charts(parent: tk.Frame) -> tuple[tk.Frame, tk.Label]:
        tk.Label(parent, text="Визуализация", font=_T.FONT_TITLE, fg=_T.TEXT, bg=_T.CARD).pack(anchor=tk.W)
        charts_host = tk.Frame(
            parent,
            bg=_T.DASH_EMPTY_BG,
            highlightthickness=1,
            highlightbackground=_T.BORDER_STRONG,
        )
        charts_host.pack(fill=tk.BOTH, expand=True, pady=(8, 0))
        placeholder = tk.Label(
            charts_host,
            text=_DASH_EMPTY_HINT,
            fg=_T.DASH_EMPTY_TEXT,
            bg=_T.DASH_EMPTY_BG,
            font=_T.FONT_SM,
            justify=tk.CENTER,
        )
        placeholder.pack(expand=True)
        return charts_host, placeholder

    # ——— Обзор
    dash_wrap = tk.Frame(tab_ov, bg=_T.CARD)
    dash_wrap.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
    _, lbl_kpi_money, lbl_kpi_docs, lbl_kpi_months, lbl_kpi_status = build_kpi(dash_wrap)

    pan = tk.PanedWindow(
        dash_wrap,
        orient=tk.HORIZONTAL,
        bg=_T.CARD,
        sashwidth=6,
        sashrelief=tk.FLAT,
        bd=0,
    )
    pan.pack(fill=tk.BOTH, expand=True)
    split_left = tk.Frame(pan, bg=_T.CARD)
    split_right = tk.Frame(pan, bg=_T.CARD)
    pan.add(split_left, minsize=300)
    pan.add(split_right, minsize=360)

    dash_tree = build_month_table(split_left)
    chart_host, chart_placeholder = build_dashboard_charts(split_right)

    _chart_resize_after: list[int | None] = [None]
    _chart_last_px: list[int] = [0, 0]
    _chart_suppress_cfg_until: list[float] = [0.0]

    def schedule_chart_resize(_evt: tk.Event | None = None) -> None:
        if time.monotonic() < _chart_suppress_cfg_until[0]:
            return
        if mpl_canvas is None:
            return
        if _chart_resize_after[0] is not None:
            try:
                inner.after_cancel(_chart_resize_after[0])
            except tk.TclError:
                pass
            _chart_resize_after[0] = None

        def _job() -> None:
            _chart_resize_after[0] = None
            if mpl_canvas is None:
                return
            try:
                chart_host.update_idletasks()
                w = chart_host.winfo_width()
                h = chart_host.winfo_height()
                if w < 48 or h < 48:
                    return
                lw, lh = _chart_last_px[0], _chart_last_px[1]
                if lw > 0 and lh > 0 and abs(w - lw) < 12 and abs(h - lh) < 12:
                    return
                _chart_last_px[0], _chart_last_px[1] = w, h
                fig = mpl_canvas.figure
                fig.set_size_inches(w / float(fig.dpi), h / float(fig.dpi), forward=False)
                mpl_canvas.draw()
            except (tk.TclError, AttributeError):
                pass

        try:
            _chart_resize_after[0] = inner.after_idle(_job)
        except tk.TclError:
            try:
                _job()
            except Exception:
                pass

    chart_host.bind("<Configure>", schedule_chart_resize, add="+")

    def _try_build_charts() -> bool:
        nonlocal mpl_canvas, ax_bar, ax_pie
        if mpl_canvas is not None:
            return True
        try:
            import matplotlib as mpl_pkg

            mpl_pkg.use("TkAgg")
            mpl_pkg.rcParams["font.sans-serif"] = [
                "Segoe UI",
                "Tahoma",
                "DejaVu Sans",
                "Arial Unicode MS",
                "sans-serif",
            ]
            mpl_pkg.rcParams["axes.unicode_minus"] = False
            mpl_pkg.rcParams["axes.formatter.useoffset"] = False
            from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
            from matplotlib.figure import Figure
            from matplotlib.gridspec import GridSpec
        except Exception:
            return False

        fig = Figure(figsize=(8.6, 4.4), dpi=100, facecolor=_DASH_CHART_BG)
        gs = GridSpec(1, 2, figure=fig, width_ratios=[1.62, 1.0], wspace=0.22)
        ax_bar = fig.add_subplot(gs[0])
        ax_pie = fig.add_subplot(gs[1])
        mpl_canvas = FigureCanvasTkAgg(fig, master=chart_host)
        return True

    _chart_last_data_sig: list[tuple[tuple[int, int, float], ...] | None] = [None]

    def _refresh_charts(
        сводка: list[_ks2.СводкаМесяца],
        docs_for_types: list[_ks2.РезультатДокумента] | None = None,
        *,
        final: bool = True,
    ) -> None:
        nonlocal mpl_canvas, ax_bar, ax_pie
        _t_refresh = time.perf_counter()
        #region agent log
        _runtime_dbg_log(
            "H3",
            "Выполнение._refresh_charts",
            "enter",
            {"final": bool(final), "n_month_rows": len(сводка)},
        )
        #endregion
        #region agent log
        _ts = __import__("time").perf_counter()
        _agent_log_ks2(
            "H3",
            "Запуск._refresh_charts",
            "enter",
            {"n_months_rows": len([s for s in сводка if s.сумма_строк > 0 or s.файлов > 0])},
        )
        #endregion
        try:
            chart_placeholder.pack_forget()
        except tk.TclError:
            pass
        ok = mpl_canvas is not None or _try_build_charts()
        if not ok or mpl_canvas is None:
            chart_placeholder.pack(expand=True)
            return
        w = mpl_canvas.get_tk_widget()
        try:
            w.pack(fill=tk.BOTH, expand=True)
        except tk.TclError:
            chart_placeholder.pack(expand=True)
            return

        if ax_bar is None:
            chart_placeholder.pack(expand=True)
            return

        if _chart_resize_after[0] is not None:
            try:
                inner.after_cancel(_chart_resize_after[0])
            except tk.TclError:
                pass
            _chart_resize_after[0] = None

        from matplotlib import ticker

        pts: list[tuple[int, int, str, float]] = []
        for s in сводка:
            if s.сумма_строк <= 0 and s.файлов == 0:
                continue
            pts.append(
                (
                    s.год,
                    s.месяц,
                    _ks2.подпись_месяца_краткая(s.год, s.месяц),
                    float(s.сумма_строк),
                ),
            )
        pts.sort(key=lambda t: (t[0], t[1]))
        labs = [p[2] for p in pts]
        vals = [p[3] for p in pts]
        use_line_chart = len(vals) > _DASH_BARH_MAX_PERIODS
        sig = tuple((y, m, round(v, 2)) for y, m, _lb, v in pts)
        if not final and sig == _chart_last_data_sig[0]:
            return
        _chart_last_data_sig[0] = sig

        grid_col = _DASH_BORDER
        tl_col = _T.TEXT

        fig = mpl_canvas.figure

        dpi = float(fig.dpi)
        ww = chart_host.winfo_width()
        hh = chart_host.winfo_height()
        if ww >= 56 and hh >= 56:
            fig.set_size_inches(ww / dpi, hh / dpi, forward=False)

        ax_bar.clear()
        ax_pie.clear()

        ax_bar.set_facecolor(_DASH_CHART_BG)
        if vals:
            ax_bar.set_title(
                f"Выручка по месяцам — {'линия' if use_line_chart else 'полосы'} ({len(vals)})",
                color=tl_col,
                fontsize=10,
                pad=8,
                fontweight="600",
                loc="left",
            )
        else:
            ax_bar.set_title(
                "Выручка по месяцам (хронология)",
                color=tl_col,
                fontsize=10,
                pad=8,
                fontweight="600",
                loc="left",
            )

        if not vals:
            ax_bar.tick_params(colors=_DASH_AXIS, labelsize=9)
            ax_bar.text(
                0.5,
                0.5,
                "Нет сумм для графика",
                ha="center",
                va="center",
                transform=ax_bar.transAxes,
                color=_DASH_MUTED,
                fontsize=11,
            )
            ax_bar.set_xticks([])
            ax_bar.set_yticks([])
            for spine in ax_bar.spines.values():
                spine.set_visible(False)
        else:
            if use_line_chart:
                n = len(vals)
                xs = list(range(n))
                ax_bar.plot(
                    xs,
                    vals,
                    color=_T.ACCENT,
                    linewidth=2.1,
                    marker="o",
                    markersize=3.4,
                    markerfacecolor="#e0f2fe",
                    markeredgecolor=_T.ACCENT,
                    markeredgewidth=0.75,
                    zorder=4,
                )
                ax_bar.fill_between(xs, vals, color=_T.ACCENT, alpha=0.13, zorder=2)
                tick_idx = _индексы_равномерных_меток(n, max_labels=12)
                tlabs = [_подпись_месяца_компакт(pts[i][0], pts[i][1]) for i in tick_idx]
                ax_bar.set_xticks(tick_idx, labels=tlabs, rotation=50, ha="right")
                ax_bar.tick_params(axis="x", colors=_DASH_AXIS, labelsize=8)
                ax_bar.set_xlim(-0.5, max(n - 1, 0) + 0.5)
                ymax = max(vals)
                ax_bar.set_ylim(0, ymax * 1.07 if ymax > 0 else 1.0)
                ax_bar.yaxis.set_major_formatter(
                    ticker.FuncFormatter(lambda v, pos: _ось_rub_formatter(v, pos)),
                )
                ax_bar.tick_params(axis="y", colors=tl_col, labelsize=8)
                ax_bar.set_xlabel("Хронология", color=_DASH_MUTED, fontsize=8, labelpad=3)
                ax_bar.set_ylabel("₽", color=_DASH_MUTED, fontsize=8)
                ax_bar.grid(axis="both", color=grid_col, linestyle=":", linewidth=0.85, alpha=0.7, zorder=0)
                ax_bar.set_axisbelow(True)
                for name, spine in ax_bar.spines.items():
                    if name in ("top", "right"):
                        spine.set_visible(False)
                    else:
                        spine.set_color(grid_col)
                        spine.set_linewidth(0.7)
            else:
                y_idx = list(range(len(labs)))
                bar_h = max(0.22, min(0.68, 0.88 / max(len(labs), 1)))
                colours = [_BAR_PALETTE[i % len(_BAR_PALETTE)] for i in range(len(labs))]
                bars = ax_bar.barh(
                    y_idx,
                    vals,
                    height=bar_h,
                    color=colours,
                    edgecolor="none",
                    linewidth=0,
                    zorder=3,
                    clip_on=False,
                )
                ax_bar.set_yticks(y_idx, labels=labs)
                ax_bar.invert_yaxis()
                ax_bar.tick_params(axis="y", colors=tl_col, labelsize=8)
                ax_bar.tick_params(axis="x", colors=_DASH_AXIS, labelsize=8)
                ax_bar.set_xlabel("Ось ₽", color=_DASH_MUTED, fontsize=8, labelpad=3)
                ax_bar.xaxis.set_major_formatter(
                    ticker.FuncFormatter(lambda v, pos: _ось_rub_formatter(v, pos)),
                )
                ax_bar.grid(axis="x", color=grid_col, linestyle=":", linewidth=0.85, alpha=0.7, zorder=0)
                ax_bar.set_axisbelow(True)
                for name, spine in ax_bar.spines.items():
                    if name in ("top", "right"):
                        spine.set_visible(False)
                    else:
                        spine.set_color(grid_col)
                        spine.set_linewidth(0.7)
                ax_bar.set_xlim(0, max(vals) * 1.18)
                if len(labs) <= 18:
                    try:
                        ax_bar.bar_label(
                            bars,
                            labels=[_краткая_сума_mln(v) for v in vals],
                            padding=5,
                            color=tl_col,
                            fontsize=7,
                            fontweight="medium",
                        )
                    except Exception:
                        for i, b in enumerate(bars):
                            bx = b.get_width()
                            if bx <= 0:
                                continue
                            ax_bar.text(
                                bx,
                                b.get_y() + b.get_height() / 2,
                                _краткая_сума_mln(vals[i]),
                                va="center",
                                ha="left",
                                fontsize=7,
                                color=tl_col,
                                xytext=(4, 0),
                                textcoords="offset points",
                            )

        ax_pie.set_facecolor(_DASH_CHART_BG)
        pie_labs: list[str] = []
        if final:
            by_type = _выручка_по_видам_работ(docs_for_types or [])
            pie_labs_raw = [k for k, v in by_type.items() if float(v) > 0]
            pie_vals_raw = [float(by_type[k]) for k in pie_labs_raw]
            pie_vals, pie_labs, pie_agg_note = _агрегировать_секторы_пирога(
                pie_vals_raw,
                pie_labs_raw,
                _PIE_MAX_SLICES,
            )
            if pie_vals and pie_labs:
                pairs = sorted(zip(pie_vals, pie_labs), key=lambda x: -float(x[0]))
                pie_vals = [float(v) for v, _ in pairs]
                pie_labs = [lb for _, lb in pairs]
            pie_ttl = "Виды работ"
            if pie_agg_note:
                pie_ttl = f"Доля выручки · {pie_agg_note}"
            ax_pie.set_title(
                pie_ttl,
                color=tl_col,
                fontsize=9 if pie_agg_note else 10,
                pad=6,
                fontweight="600",
                loc="left",
            )

            if not pie_vals:
                ax_pie.axis("off")
                ax_pie.text(
                    0.5,
                    0.5,
                    "Нет положительных сумм\nдля круговой диаграммы",
                    ha="center",
                    va="center",
                    transform=ax_pie.transAxes,
                    color=_DASH_MUTED,
                    fontsize=9,
                )
            else:
                colours_p = [_BAR_PALETTE[i % len(_BAR_PALETTE)] for i in range(len(pie_vals))]
                pct_fmt: str | None = "%1.0f%%" if len(pie_vals) <= 10 else None
                wedges, _tw, autopcts = ax_pie.pie(
                    pie_vals,
                    labels=None,
                    autopct=pct_fmt,
                    pctdistance=0.74,
                    startangle=90,
                    counterclock=False,
                    textprops={"fontsize": 8},
                    wedgeprops={"linewidth": 1.25, "edgecolor": _DASH_CHART_BG, "width": 0.5},
                    colors=colours_p,
                )
                if autopcts:
                    for pct in autopcts:
                        pct.set_fontsize(8)
                        pct.set_fontweight("bold")
                        pct.set_color("#020617")
                ncol_leg = min(2, max(1, len(pie_labs)))
                leg_rows = (len(pie_labs) + ncol_leg - 1) // ncol_leg
                lg = ax_pie.legend(
                    wedges,
                    pie_labs,
                    loc="upper center",
                    bbox_to_anchor=(0.5, -0.02 - 0.05 * max(leg_rows - 1, 0)),
                    bbox_transform=ax_pie.transAxes,
                    ncol=ncol_leg,
                    frameon=False,
                    fontsize=8,
                    labelcolor=_DASH_AXIS,
                    handlelength=1.1,
                    handletextpad=0.45,
                    columnspacing=1.2,
                    borderaxespad=0.0,
                    title="Виды работ",
                    title_fontsize=8,
                )
                lg.get_title().set_color(_DASH_MUTED)
                ax_pie.set_aspect("equal")
        else:
            ax_pie.axis("off")
            ax_pie.text(
                0.5,
                0.5,
                "Промежуточный рендер\nкруг обновится в финале",
                ha="center",
                va="center",
                transform=ax_pie.transAxes,
                color=_DASH_MUTED,
                fontsize=9,
            )

        ax_pie.set_xticks([])
        ax_pie.set_yticks([])
        ax_pie.set_frame_on(False)

        ncol_adj = min(3, max(1, len(pie_labs))) if pie_labs else 1
        leg_rows_adj = ((len(pie_labs) + ncol_adj - 1) // ncol_adj) if pie_labs else 0
        bottom_m_extra = leg_rows_adj * 0.064 + 0.125

        if vals:
            if use_line_chart:
                lm = 0.10
            else:
                lm = max(0.24, min(0.55, max(len(str(x)) for x in labs) * 0.036))
            bottom_m = max(0.22, min(0.40, bottom_m_extra))
            fig.subplots_adjust(left=lm, right=0.97, bottom=bottom_m, top=0.86, wspace=0.26)
        else:
            fig.subplots_adjust(left=0.12, right=0.96, bottom=0.18, top=0.85, wspace=0.22)

        #region agent log
        _agent_log_ks2(
            "H3",
            "Запуск._refresh_charts",
            "before_draw",
            {"elapsed_ms": int((__import__("time").perf_counter() - _ts) * 1000)},
        )
        #endregion
        try:
            if final:
                mpl_canvas.draw()
            else:
                mpl_canvas.draw_idle()
            _chart_last_px[0] = chart_host.winfo_width()
            _chart_last_px[1] = chart_host.winfo_height()
            _chart_suppress_cfg_until[0] = time.monotonic() + 0.2
        except (tk.TclError, AttributeError):
            mpl_canvas.draw_idle()
        #region agent log
        _runtime_dbg_log(
            "H3",
            "Выполнение._refresh_charts",
            "exit",
            {"final": bool(final), "elapsed_ms": int((time.perf_counter() - _t_refresh) * 1000)},
        )
        #endregion

    def _populate_month_table(сводка: list[_ks2.СводкаМесяца]) -> None:
        dash_tree.delete(*dash_tree.get_children())
        total = max(0.0, _ks2.всего_выручка_по_сводке(сводка))
        for s in сводка:
            if s.сумма_строк <= 0 and s.файлов == 0:
                continue
            mkey = f"{s.год}-{s.месяц:02d}"
            lab = _ks2.подпись_месяца_краткая(s.год, s.месяц)
            share = (float(s.сумма_строк) / total * 100.0) if total > 0 else 0.0
            dash_tree.insert(
                "",
                tk.END,
                iid=mkey,
                text=lab,
                values=(_fmt_money_rub(s.сумма_строк), _fmt_percent(share)),
            )

    def clear_dashboard_for_empty() -> None:
        #region agent log
        _agent_log_ks2("H4", "Запуск.clear_dashboard_for_empty", "called", {})
        #endregion
        lbl_kpi_money.configure(text="—")
        lbl_kpi_docs.configure(text="—")
        lbl_kpi_months.configure(text="—")
        lbl_kpi_status.configure(text="Набор не загружен")
        dash_tree.delete(*dash_tree.get_children())
        try:
            if mpl_canvas is not None:
                mpl_canvas.get_tk_widget().pack_forget()
        except tk.TclError:
            pass
        chart_placeholder.pack(expand=True)

    def refresh_dashboard(
        docs: list[_ks2.РезультатДокумента],
        сводка: list[_ks2.СводкаМесяца],
        *,
        final: bool = True,
        refresh_tree: bool = True,
    ) -> None:
        #region agent log
        _agent_log_ks2(
            "H4",
            "Запуск.refresh_dashboard",
            "called",
            {
                "n_docs": len(docs),
                "n_month_rows": len(сводка),
                "non_zero_rows": len([s for s in сводка if s.сумма_строк > 0 or s.файлов > 0]),
            },
        )
        #endregion
        total_money = _ks2.всего_выручка_по_сводке(сводка)
        n_docs = sum(1 for d in docs if not d.ошибка)
        active_months = len([s for s in сводка if s.файлов > 0 or s.сумма_строк > 0])

        lbl_kpi_money.configure(text=_fmt_money_rub(total_money) if total_money else "—")
        lbl_kpi_docs.configure(text=str(n_docs))
        lbl_kpi_months.configure(text=str(active_months))
        if final:
            lbl_kpi_status.configure(
                text=f"Обновлено: {time.strftime('%d.%m.%Y %H:%M')}  |  Файлов в наборе: {len(files)}",
            )
        else:
            lbl_kpi_status.configure(
                text=f"Идет обработка: {n_docs}/{max(len(files), 1)} файлов уже готовы",
            )
        if refresh_tree:
            refresh_files_tree(docs)
        _populate_month_table(сводка)
        _refresh_charts(сводка, docs, final=final)

    # ——— Файлы
    panel_mid = tk.Frame(tab_files, bg=_T.CARD)
    panel_mid.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

    files_head = tk.Frame(panel_mid, bg=_T.CARD)
    files_head.pack(fill=tk.X)
    tk.Label(
        files_head,
        text="Набор файлов для разбора",
        font=_T.FONT_TITLE,
        fg=_T.TEXT,
        bg=_T.CARD,
    ).pack(side=tk.LEFT, anchor=tk.W)
    progress_row = tk.Frame(panel_mid, bg=_T.CARD)
    progress_row.pack(fill=tk.X, pady=(4, 4))
    lbl_progress = tk.Label(
        progress_row,
        text="Загрузка КС-2: 0%",
        font=_T.FONT_CAPTION,
        fg=_T.TEXT_DIM,
        bg=_T.CARD,
    )
    lbl_progress.pack(side=tk.LEFT, padx=(0, 8))
    progress_var = tk.DoubleVar(value=0.0)
    pb = ttk.Progressbar(
        progress_row,
        orient=tk.HORIZONTAL,
        mode="determinate",
        maximum=100.0,
        variable=progress_var,
    )
    pb.pack(side=tk.LEFT, fill=tk.X, expand=True)
    tree_wrap = tk.Frame(
        panel_mid,
        bg=_T.CARD_ALT,
        highlightthickness=1,
        highlightbackground=_T.ACCENT_DIM,
    )
    tree_wrap.pack(fill=tk.BOTH, expand=True, pady=(4, 0))

    _stv = ttk.Style(inner.winfo_toplevel())
    try:
        _stv.configure(
            _FILES_TREE_STYLE,
            rowheight=64,
            font=_T.FONT_BASE,
            fieldbackground=_T.CARD,
            background=_T.CARD,
            foreground=_T.TEXT,
        )
        _stv.map(
            _FILES_TREE_STYLE,
            background=[("selected", _T.ACCENT)],
            foreground=[("selected", _T.ACCENT_FG)],
        )
    except tk.TclError:
        pass

    tv_style = _FILES_TREE_STYLE
    try:
        tree = ttk.Treeview(
            tree_wrap,
            columns=_files_tree_cols,
            show="tree headings",
            height=12,
            selectmode="extended",
            style=tv_style,
        )
    except tk.TclError:
        tv_style = "Treeview"
        tree = ttk.Treeview(
            tree_wrap,
            columns=_files_tree_cols,
            show="tree headings",
            height=12,
            selectmode="extended",
            style=tv_style,
        )
    tree.heading("#0", text="Файл / наименование")
    tree.column("#0", width=420, minwidth=180, anchor=tk.W, stretch=True)
    tree.heading("month", text="Месяц")
    tree.column("month", width=108, minwidth=88, anchor=tk.CENTER, stretch=False)
    tree.heading("bez_nds", text="Доход без НДС")
    tree.column("bez_nds", width=98, minwidth=80, anchor=tk.E, stretch=False)
    tree.heading("s_nds", text="Доход с НДС")
    tree.column("s_nds", width=98, minwidth=80, anchor=tk.E, stretch=False)
    tree.heading("unit", text="Ед.")
    tree.column("unit", width=46, minwidth=40, anchor=tk.CENTER, stretch=False)
    tree.heading("qty", text="Кол-во")
    tree.column("qty", width=62, minwidth=48, anchor=tk.CENTER, stretch=False)
    saved_w = _загрузить_ширины_колонок_дерева()
    for scid, sw in saved_w.items():
        try:
            tree.column(scid, width=int(sw))
        except (tk.TclError, ValueError, TypeError):
            pass

    _save_cols_after_id: str | None = None

    def _flush_save_cols() -> None:
        nonlocal _save_cols_after_id
        _save_cols_after_id = None
        try:
            _сохранить_ширины_колонок_дерева(tree)
        except Exception:
            pass

    def _schedule_save_cols() -> None:
        nonlocal _save_cols_after_id
        if _save_cols_after_id is not None:
            try:
                inner.after_cancel(_save_cols_after_id)
            except tk.TclError:
                pass
            _save_cols_after_id = None
        try:
            _save_cols_after_id = inner.after(450, _flush_save_cols)
        except tk.TclError:
            pass

    tree.bind("<ButtonRelease-1>", lambda _e: _schedule_save_cols(), add=True)

    ys = ttk.Scrollbar(tree_wrap, orient=tk.VERTICAL, command=tree.yview)
    tree.configure(yscrollcommand=ys.set)
    tree.grid(row=0, column=0, sticky="nsew")
    ys.grid(row=0, column=1, sticky="ns")
    tree_wrap.columnconfigure(0, weight=1)
    tree_wrap.rowconfigure(0, weight=1)

    # Технический буфер отчёта (вкладка «Детальный отчёт» удалена).
    report_frame = tk.Frame(inner, bg=_T.TEXT_FIELD_BG)
    txt = scrolledtext.ScrolledText(
        report_frame,
        wrap=tk.WORD,
        font=_T.FONT_SM,
        bg=_T.TEXT_AREA_BG,
        fg=_T.TEXT,
        insertbackground=_T.TEXT,
        highlightthickness=0,
        bd=0,
        padx=10,
        pady=10,
    )

    def refresh_files_tree(документы: list[_ks2.РезультатДокумента] | None = None) -> None:
        nonlocal saved_docs_map
        tree.delete(*tree.get_children())
        docs_src = документы if документы is not None else _reload_saved_docs()
        saved_docs_map = {_doc_id(d): d for d in docs_src}
        # Подгоняем перенос текста под фактическую ширину текущей колонки #0.
        try:
            col_px = int(tree.column("#0", "width"))
        except (tk.TclError, TypeError, ValueError):
            col_px = 420
        try:
            font_name = str(tree.cget("font") or _T.FONT_BASE)
            fnt = tkfont.nametofont(font_name) if isinstance(font_name, str) and font_name else tkfont.Font(font=_T.FONT_BASE)
            avg_char_px = max(6, int(fnt.measure("0123456789") / 10))
        except Exception:
            avg_char_px = 7
        wrap_chars = max(24, int((col_px - 24) / avg_char_px))
        for d in docs_src:
            fp_n = _doc_id(d)
            display_name = d.имя or os.path.basename(d.путь) or f"КС-2 {fp_n[:8]}"
            vals = _строка_значений_корня_файла(d)
            tree.insert(
                "",
                tk.END,
                iid=fp_n,
                text=_перенос_для_дерева(display_name, width=wrap_chars, max_lines=3),
                values=vals,
            )
            if d and not d.ошибка and d.узлы_позиций:
                for node in d.узлы_позиций:
                    parent_iid = fp_n
                    if node.родитель_id:
                        cand = f"{fp_n}{_TREE_IID_SEP}{node.родитель_id}"
                        if tree.exists(cand):
                            parent_iid = cand
                    my_iid = f"{fp_n}{_TREE_IID_SEP}{node.дерево_id}"
                    tree.insert(
                        parent_iid,
                        tk.END,
                        iid=my_iid,
                        text=_текст_узла_сметы(node, wrap_width=wrap_chars, max_lines=3),
                        values=(node.единица or "—", node.количество or "—", "", "", ""),
                    )
                try:
                    tree.item(fp_n, open=False)
                except tk.TclError:
                    pass

    def _selected_root_ids() -> list[str]:
        sel = list(tree.selection())
        if not sel:
            return []
        out: list[str] = []
        for iid in sel:
            doc_id = _файл_из_iid_дерева(str(iid))
            if doc_id in saved_docs_map and doc_id not in out:
                out.append(doc_id)
        return out

    def remove_selected_ks2() -> None:
        nonlocal last_run
        picked = _selected_root_ids()
        if not picked:
            txt.delete("1.0", tk.END)
            txt.insert(tk.END, "Выберите КС-2 в таблице для удаления.\n")
            nb.select(tab_files)
            return
        for doc_id in picked:
            _ks2.удалить_сохраненный_по_хэшу(doc_id)
        files[:] = [fp for fp in files if _ks2.получить_сохраненный_результат(fp) is not None]
        persist()
        docs_saved = _reload_saved_docs()
        refresh_files_tree(docs_saved)
        if docs_saved:
            sv_saved = _ks2.агрегировать_по_месяцам(docs_saved)
            last_run = (docs_saved, sv_saved)
            refresh_dashboard(docs_saved, sv_saved, final=True, refresh_tree=False)
        else:
            last_run = None
            clear_dashboard_for_empty()
        txt.delete("1.0", tk.END)
        txt.insert(tk.END, f"Удалено КС-2: {len(picked)}.\n")
        nb.select(tab_files)

    def select_all_ks2() -> None:
        roots = list(tree.get_children(""))
        if not roots:
            return
        tree.selection_set(roots)
        try:
            tree.focus(roots[0])
            tree.see(roots[0])
        except tk.TclError:
            pass

    def add_files() -> None:
        #region agent log
        _runtime_dbg_log("H5", "Выполнение.add_files", "enter", {"files_before": len(files)})
        #endregion
        clear_err()
        p = filedialog.askopenfilenames(
            parent=inner.winfo_toplevel(),
            title="Выберите файлы КС-2 (.xlsx)",
            filetypes=[("Excel Книга", "*.xlsx"), ("Все файлы", "*.*")],
        )
        #region agent log
        _runtime_dbg_log("H1", "Выполнение.add_files", "dialog_result", {"picked_count": len(p) if p else 0})
        #endregion
        if not p:
            #region agent log
            _runtime_dbg_log("H1", "Выполнение.add_files", "exit_no_pick", {})
            #endregion
            return
        changed = False
        for q in p:
            qn = os.path.normpath(q)
            if qn not in files:
                files.append(qn)
                changed = True
        #region agent log
        _runtime_dbg_log("H2", "Выполнение.add_files", "after_merge", {"changed": bool(changed), "files_after_merge": len(files)})
        #endregion
        if not changed:
            #region agent log
            _runtime_dbg_log("H2", "Выполнение.add_files", "exit_no_changed", {})
            #endregion
            if files:
                _run_reason[0] = "add_files_reuse_existing"
                run_analysis()
            else:
                txt.insert(tk.END, "\nНе выбрано новых файлов для разбора.\n")
            return
        refresh_files_tree(None)
        persist()
        nb.select(tab_ov)
        _run_reason[0] = "add_files_button_auto_run"
        #region agent log
        _runtime_dbg_log("H3", "Выполнение.add_files", "before_run_analysis", {"reason": _run_reason[0], "files_for_run": len(files)})
        #endregion
        run_analysis()

    refresh_files_tree(None)

    #region agent log
    _agent_log_ks2("H1", "Запуск.запустить", "session_paths_loaded", {"n_files": len(files)})
    #endregion

    def run_analysis() -> None:
        nonlocal last_run
        #region agent log
        _t_main = __import__("time").perf_counter()
        _agent_log_ks2("H1", "Запуск.run_analysis", "enter", {"n_files": len(files)})
        #region agent log
        _runtime_dbg_log(
            "H3",
            "Выполнение.run_analysis",
            "enter",
            {"n_files": len(files), "reason": _run_reason[0], "busy": bool(_analysis_busy[0])},
        )
        #endregion
        #endregion
        clear_err()
        txt.delete("1.0", tk.END)
        nb.select(tab_ov)
        progress_var.set(0.0)
        lbl_progress.configure(text="Загрузка КС-2: 0%")
        if not files:
            txt.insert(
                tk.END,
                "Файлы КС-2 пока не добавлены.\n"
                "Нажмите «Добавить КС-2», выберите .xlsx и разбор запустится автоматически.\n",
            )
            last_run = None
            clear_dashboard_for_empty()
            refresh_files_tree(None)
            return
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            msg = (
                "Не хватает зависимости для чтения Excel: `openpyxl`.\n"
                "Откройте консоль в папке утилиты «Выполнение» и выполните:\n"
                "pip install -r requirements.txt\n"
            )
            txt.insert(tk.END, msg)
            log_err("Выполнение: нет openpyxl")
            last_run = None
            clear_dashboard_for_empty()
            refresh_files_tree(None)
            return

        if _analysis_busy[0]:
            _analysis_pending[0] = True
            #region agent log
            _agent_log_ks2("H1", "Запуск.run_analysis", "skipped_busy_queue_pending", {})
            #endregion
            return

        _analysis_busy[0] = True
        txt.insert(
            tk.END,
            f"Идёт разбор {len(files)} файл(ов) в фоне — окно остаётся отзывчивым. Подождите завершения.\n\n",
        )
        paths_snapshot = list(files)
        ui_events: queue.Queue[tuple[str, object]] = queue.Queue()

        def _set_progress(done_count: int, total_count: int) -> None:
            total = max(1, int(total_count))
            pct = int(round((float(done_count) / float(total)) * 100.0))
            pct = max(0, min(100, pct))
            progress_var.set(float(pct))
            lbl_progress.configure(text=f"Загрузка КС-2: {pct}% ({done_count}/{total_count})")

        def _drain_pending() -> None:
            if _analysis_pending[0]:
                _analysis_pending[0] = False
                inner.after(80, run_analysis)

        def _poll_worker_events() -> None:
            if not _analysis_busy[0]:
                return
            try:
                ev_count = 0
                while True:
                    kind, payload = ui_events.get_nowait()
                    ev_count += 1
                    if kind == "partial":
                        документы, сводка, done_count, total_count, refresh_tree_now = payload  # type: ignore[misc]
                        apply_partial(документы, сводка, done_count, total_count, refresh_tree_now)
                    elif kind == "error":
                        apply_error(str(payload))
                    elif kind == "ok":
                        документы, сводка, tstart = payload  # type: ignore[misc]
                        apply_ok(документы, сводка, float(tstart))
                # unreachable
            except queue.Empty:
                if ev_count > 0:
                    #region agent log
                    _runtime_dbg_log("H1", "Выполнение._poll_worker_events", "drained_batch", {"events": ev_count})
                    #endregion
                pass
            try:
                inner.after(60, _poll_worker_events)
            except tk.TclError:
                pass

        def apply_error(err: str) -> None:
            _analysis_busy[0] = False
            #region agent log
            _agent_log_ks2("H1", "Запуск.run_analysis", "worker_error", {"err": err[:300]})
            #endregion
            try:
                if not inner.winfo_exists():
                    return
            except tk.TclError:
                return
            log_err(f"Выполнение: разбор: {err}")
            try:
                txt.insert(tk.END, f"\nОшибка разбора: {err}\n")
            except tk.TclError:
                pass
            last_run = None
            clear_dashboard_for_empty()
            refresh_files_tree(None)
            lbl_progress.configure(text="Загрузка КС-2: ошибка")
            _drain_pending()

        def apply_partial(
            документы: list[_ks2.РезультатДокумента],
            сводка: list[_ks2.СводкаМесяца],
            done_count: int,
            total_count: int,
            refresh_tree_now: bool,
        ) -> None:
            nonlocal last_run
            try:
                if not inner.winfo_exists():
                    return
            except tk.TclError:
                return
            now = time.monotonic()
            if done_count < total_count and (now - _partial_last_ui_ts[0]) < _PARTIAL_UI_MIN_INTERVAL_SEC:
                #region agent log
                _runtime_dbg_log(
                    "H3",
                    "Выполнение.apply_partial",
                    "throttled",
                    {"done": done_count, "total": total_count},
                )
                #endregion
                return
            _partial_last_ui_ts[0] = now
            #region agent log
            _runtime_dbg_log(
                "H1",
                "Выполнение.apply_partial",
                "apply",
                {"done": done_count, "total": total_count, "refresh_tree": bool(refresh_tree_now)},
            )
            #endregion
            _set_progress(done_count, total_count)
            last_run = (документы, сводка)
            refresh_dashboard(документы, сводка, final=False, refresh_tree=refresh_tree_now)
            txt.delete("1.0", tk.END)
            txt.insert(
                tk.END,
                f"Разобрано {done_count}/{total_count} файлов. Графики обновляются по мере разбора...\n\n",
            )
            #region agent log
            _agent_log_ks2(
                "H4",
                "Запуск.run_analysis",
                "partial_ui_update",
                {"done": done_count, "total": total_count, "non_zero_rows": len([s for s in сводка if s.сумма_строк > 0 or s.файлов > 0])},
            )
            #endregion

        def apply_ok(
            документы: list[_ks2.РезультатДокумента],
            сводка: list[_ks2.СводкаМесяца],
            t_worker_start: float,
        ) -> None:
            nonlocal last_run
            _analysis_busy[0] = False
            #region agent log
            import time as _time

            _agent_log_ks2(
                "H1",
                "Запуск.run_analysis",
                "after_parse_pack",
                {
                    "n_docs": len(документы),
                    "parse_ms": int((_time.perf_counter() - t_worker_start) * 1000),
                    "runId": "post-fix",
                },
            )
            _agent_log_ks2(
                "H1",
                "Запуск.run_analysis",
                "done",
                {
                    "total_ms": int((_time.perf_counter() - _t_main) * 1000),
                    "runId": "post-fix",
                },
            )
            #endregion
            try:
                if not inner.winfo_exists():
                    return
            except tk.TclError:
                return
            last_run = (документы, сводка)
            refresh_dashboard(документы, сводка, final=True, refresh_tree=True)
            _set_progress(len(документы), max(len(paths_snapshot), 1))
            txt.delete("1.0", tk.END)
            txt.insert(tk.END, _ks2.текстовый_отчёт(документы, сводка))
            nb.select(tab_ov)
            clear_err()
            _drain_pending()

        def worker() -> None:
            import time as _time

            tw = _time.perf_counter()
            try:
                документы: list[_ks2.РезультатДокумента] = []
                files_by_month: dict[tuple[int, int], set[str]] = {}
                sum_by_month: dict[tuple[int, int], float] = {}

                def _add_doc_to_agg(d: _ks2.РезультатДокумента) -> None:
                    if d.ошибка:
                        return
                    amt = float(d.выручка_по_документу if d.выручка_по_документу is not None else 0.0)
                    months_used = (
                        list(d.месяцы_распределения_выручки)
                        if d.месяцы_распределения_выручки
                        else (
                            [(d.период_дата[0], d.период_дата[1])]
                            if d.период_дата
                            else [_ks2.UNKNOWN_MONTH_KEY]
                        )
                    )
                    portion = amt / len(months_used) if months_used else 0.0
                    for key in months_used:
                        files_by_month.setdefault(key, set()).add(d.имя)
                        sum_by_month[key] = sum_by_month.get(key, 0.0) + portion

                def _snapshot_summary() -> list[_ks2.СводкаМесяца]:
                    keys = set(files_by_month.keys()) | set(sum_by_month.keys())
                    out: list[_ks2.СводкаМесяца] = []
                    for gy, mo in sorted(keys, key=lambda t: (t[0] if t[0] else 9999, t[1] if t[1] else 13)):
                        names = sorted(files_by_month.get((gy, mo), set()))
                        out.append(
                            _ks2.СводкаМесяца(
                                год=gy,
                                месяц=mo,
                                файлов=len(names),
                                имена_файлов=names,
                                сумма_строк=sum_by_month.get((gy, mo), 0.0),
                            )
                        )
                    return out

                total = len(paths_snapshot)
                max_workers = max(1, min(2, total, (os.cpu_count() or 2)))
                #region agent log
                _runtime_dbg_log("H2", "Выполнение.worker", "start", {"total": total, "max_workers": max_workers})
                #endregion
                done_count = 0
                docs_by_path: dict[str, _ks2.РезультатДокумента] = {}

                with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="ks2_doc") as ex:
                    fut_map = {ex.submit(_ks2.разобрать_или_взять_сохраненный, p): p for p in paths_snapshot}
                    for fut in as_completed(fut_map):
                        d = fut.result()
                        docs_by_path[d.путь] = d
                        done_count += 1
                        документы = [docs_by_path[p] for p in paths_snapshot if p in docs_by_path]
                        _add_doc_to_agg(d)
                        # Показываем графики сразу на первых результатах и дальше периодически.
                        if done_count <= 3 or done_count % 20 == 0 or done_count == total:
                            docs_snapshot = list(документы)
                            sv_partial = _snapshot_summary()
                            refresh_tree_now = done_count <= 2 or done_count % 20 == 0 or done_count == total
                            ui_events.put(("partial", (docs_snapshot, sv_partial, done_count, total, refresh_tree_now)))
                документы = [docs_by_path[p] for p in paths_snapshot if p in docs_by_path]
                сводка = _ks2.агрегировать_по_месяцам(документы)
                #region agent log
                _runtime_dbg_log(
                    "H2",
                    "Выполнение.worker",
                    "done",
                    {"done_count": done_count, "docs_final": len(документы), "elapsed_ms": int((_time.perf_counter() - tw) * 1000)},
                )
                #endregion
            except Exception as e:
                #region agent log
                _runtime_dbg_log("H2", "Выполнение.worker", "error", {"err": str(e)[:300]})
                #endregion
                ui_events.put(("error", str(e)))
                return
            d_ok, s_ok = документы, сводка
            ui_events.put(("ok", (d_ok, s_ok, tw)))

        threading.Thread(target=worker, daemon=True, name="ks2_parse_worker").start()
        _poll_worker_events()

    def _action_btn(
        parent: tk.Misc,
        *,
        text: str,
        command: callable,
    ) -> tk.Button:
        btn = tk.Button(
            parent,
            text=text,
            command=command,
            font=_T.FONT_MD,
            bg=_T.SECONDARY_BTN_BG,
            fg=_T.SECONDARY_BTN_FG,
            activebackground=_T.SECONDARY_BTN_ACTIVE,
            activeforeground=_T.SECONDARY_BTN_FG,
            relief=tk.FLAT,
            cursor="hand2",
            padx=12,
            pady=8,
        )
        return btn

    def build_files_toolbar(parent: tk.Frame) -> tk.Frame:
        toolbar = tk.Frame(parent, bg=_T.CARD)
        toolbar.pack(side=tk.RIGHT)
        _action_btn(
            toolbar,
            text="Добавить КС-2",
            command=add_files,
        ).pack(side=tk.LEFT, padx=(0, 8))
        _action_btn(
            toolbar,
            text="Выбрать все",
            command=select_all_ks2,
        ).pack(side=tk.LEFT, padx=(0, 8))
        _action_btn(
            toolbar,
            text="Удалить КС-2",
            command=remove_selected_ks2,
        ).pack(side=tk.LEFT)
        return toolbar

    build_files_toolbar(files_head)

    docs_saved = _reload_saved_docs()
    if docs_saved:
        sv_saved = _ks2.агрегировать_по_месяцам(docs_saved)
        last_run = (docs_saved, sv_saved)
        refresh_files_tree(docs_saved)
        refresh_dashboard(docs_saved, sv_saved, final=True, refresh_tree=False)
        txt.delete("1.0", tk.END)
        txt.insert(
            tk.END,
            f"Загружены сохранённые результаты: {len(docs_saved)} документ(ов).\n"
            "Источник данных — локальное хранилище. Повторно загружать Excel не нужно.\n"
            "Для пополнения: импортируйте JSON или добавьте Excel и нажмите «Выполнить разбор КС-2».\n",
        )
    else:
        txt.delete("1.0", tk.END)
        txt.insert(
            tk.END,
            "Сохранённых КС-2 пока нет.\n"
            "Импортируйте JSON-результат или добавьте Excel и выполните разбор один раз.\n",
        )
