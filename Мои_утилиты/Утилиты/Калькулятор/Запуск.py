# -*- coding: utf-8 -*-
"""
Калькулятор в стиле хаба: светлая карточка, акцентные кнопки, история вычислений.
"""

from __future__ import annotations

import os
import re
import sys
import tkinter as tk
from tkinter import ttk

_утил_dir = os.path.dirname(os.path.abspath(__file__))
_ядро = os.path.normpath(os.path.join(_утил_dir, "..", "..", "Ядро"))
if _ядро not in sys.path:
    sys.path.insert(0, _ядро)

import hub_theme as _T  # type: ignore
import оформление_утилиты as _shell  # type: ignore

_HISTORY_MAX = 5


def запустить(родитель: tk.Misc) -> None:
    rep = getattr(родитель, "report_tab_error", None)

    def set_tab_error(on: bool) -> None:
        if callable(rep):
            try:
                rep(bool(on))
            except Exception:
                pass

    _, inner = _shell.карточка_утилиты(родитель, "Калькулятор")

    disp = tk.Entry(
        inner,
        font=_T.FONT_MONO_XL,
        justify=tk.RIGHT,
        relief=tk.FLAT,
        bd=10,
        highlightthickness=2,
        highlightbackground=_T.BORDER_STRONG,
        highlightcolor=_T.ACCENT,
        bg=_T.CARD_ALT,
    )
    disp.pack(fill=tk.X, pady=(0, 14))
    disp.focus_set()

    hist_fr = tk.Frame(inner, bg=_T.CARD)
    hist_fr.pack(fill=tk.X, pady=(0, 12))

    tk.Label(hist_fr, text="Последние вычисления", font=_T.FONT_SM, fg=_T.TEXT_DIM, bg=_T.CARD).pack(anchor=tk.W)
    hist_list = tk.Listbox(
        hist_fr,
        height=5,
        font=_T.FONT_MONO,
        relief=tk.FLAT,
        highlightthickness=1,
        highlightbackground=_T.BORDER,
        bg=_T.CARD_ALT,
        fg=_T.TEXT,
        selectbackground=_T.ACCENT,
        selectforeground=_T.ACCENT_FG,
    )
    hist_list.pack(fill=tk.X, pady=(6, 0))

    history: list[str] = []

    def push_history(line: str) -> None:
        history.insert(0, line)
        del history[_HISTORY_MAX:]
        hist_list.delete(0, tk.END)
        for h in history:
            hist_list.insert(tk.END, h)

    def show_error(msg: str = "Ошибка") -> None:
        disp.delete(0, tk.END)
        disp.insert(0, msg)
        disp.config(bg="#fee2e2")
        set_tab_error(True)

    def clear_error_style() -> None:
        disp.config(bg=_T.CARD_ALT)
        set_tab_error(False)

    def to_py_expr(s: str) -> str:
        return s.replace("×", "*").replace("÷", "/")

    def safe_eval(expr: str) -> float:
        e = to_py_expr(expr).strip()
        if not e:
            raise ValueError("пусто")
        if re.search(r"[^0-9eE.+\-*/() ]", e):
            raise ValueError("недопустимые символы")
        return float(eval(e, {"__builtins__": {}}, {}))

    def on_equals(_e=None) -> None:
        try:
            try:
                disp.focus_set()
            except Exception:
                pass
            clear_error_style()
            expr = disp.get()
            val = safe_eval(expr)
            if val == int(val):
                sval = str(int(val))
            else:
                sval = f"{val:.10g}"
            push_history(f"{expr} = {sval}")
            disp.delete(0, tk.END)
            disp.insert(0, sval)
        except ZeroDivisionError:
            show_error("Ошибка")
        except Exception:
            show_error("Ошибка")

    def on_clear() -> None:
        try:
            disp.focus_set()
        except Exception:
            pass
        clear_error_style()
        disp.delete(0, tk.END)

    def on_back() -> None:
        try:
            disp.focus_set()
        except Exception:
            pass
        clear_error_style()
        s = disp.get()
        disp.delete(0, tk.END)
        disp.insert(0, s[:-1])

    def append(ch: str) -> None:
        try:
            disp.focus_set()
        except Exception:
            pass
        clear_error_style()
        disp.insert(tk.END, ch)

    grid_fr = tk.Frame(inner, bg=_T.CARD)
    grid_fr.pack(pady=(4, 0))

    rows = [
        ["7", "8", "9", "÷"],
        ["4", "5", "6", "×"],
        ["1", "2", "3", "-"],
        [".", "0", "=", "+"],
        ["C", "⌫", "", ""],
    ]

    def mk_cmd(t: str):
        if t == "":
            return None
        if t == "=":
            return on_equals
        if t == "C":
            return on_clear
        if t == "⌫":
            return on_back
        return lambda: append(t)

    def btn_style_grid(op: bool) -> dict:
        bg = _T.SURFACE_SOFT_MID if op else _T.SURFACE_SOFT
        return dict(
            font=(_T.FF, 12, "bold" if op else "normal"),
            width=5,
            height=1,
            relief=tk.FLAT,
            bd=0,
            padx=4,
            pady=6,
            bg=bg,
            activebackground=_T.ACCENT_HOVER,
            activeforeground=_T.TEXT_ON_SOFT,
            fg=_T.TEXT_ON_SOFT if not op else _T.ACCENT_DIM,
        )

    def is_op(tok: str) -> bool:
        return tok in ("÷", "×", "-", "+", "=")

    for r, row in enumerate(rows):
        for c, token in enumerate(row):
            cmd = mk_cmd(token)
            if cmd is None:
                tk.Label(grid_fr, text="", width=5, bg=_T.CARD).grid(row=r, column=c, padx=6, pady=6)
            elif token == "=":
                tb = ttk.Button(grid_fr, text=token, command=cmd, style="Accent.TButton", width=4)
                tb.grid(row=r, column=c, padx=6, pady=6, sticky="nsew")
            else:
                op = is_op(token)
                st = btn_style_grid(op)
                if token == "C":
                    st["bg"] = _T.SURFACE_SOFT
                    st["fg"] = _T.DANGER
                    st["activeforeground"] = _T.DANGER
                if token == "⌫":
                    st["font"] = (_T.FF, 11)
                b = tk.Button(grid_fr, text=token, command=cmd, **st)
                b.grid(row=r, column=c, padx=6, pady=6)

    def on_key(event) -> str | None:
        try:
            if event.keysym in ("Return", "KP_Enter"):
                on_equals()
                return "break"
            ch = event.char
            if ch and ch in "0123456789.+-*/":
                clear_error_style()
                return None
            if event.keysym == "BackSpace":
                clear_error_style()
                return None
        except Exception:
            pass
        return None

    disp.bind("<KeyPress>", on_key)
    disp.bind("<Return>", lambda e: on_equals())
    disp.bind("<KP_Enter>", lambda e: on_equals())
