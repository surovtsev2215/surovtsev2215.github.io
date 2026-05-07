# -*- coding: utf-8 -*-
"""Общая оболочка карточки утилиты: ttk-стили хаба и визуальная связка с главным окном."""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk

import hub_theme


def подготовить_стиль(родитель: tk.Misc) -> ttk.Style:
    """Фон контейнера и единые стили ttk для утилиты внутри хаба."""
    try:
        родитель.configure(bg=hub_theme.CARD_ALT)
    except Exception:
        pass
    st = ttk.Style(родитель.winfo_toplevel())
    hub_theme.apply_hub_ttk(st, card_bg=hub_theme.CARD_ALT)
    return st


def карточка_утилиты(
    родитель: tk.Misc,
    заголовок: str | None = None,
    подзаголовок: str | None = None,
) -> tuple[tk.Frame, tk.Frame]:
    """
    Собирает белую карточку утилиты (без верхней акцентной полосы); при ``заголовок=None`` только рамка и тело (без строки заголовка).

    Возвращает ``(wrap, body)``: ``wrap`` заполняет ``родитель``;
    во ``body`` (фон CARD) размещают поля, кнопки и таблицы утилиты.
    """
    подготовить_стиль(родитель)

    wrap = tk.Frame(родитель, bg=hub_theme.CARD_ALT)
    wrap.pack(fill=tk.BOTH, expand=True)

    stack = tk.Frame(wrap, bg=hub_theme.CARD_ALT)
    stack.pack(fill=tk.BOTH, expand=True)

    shell = tk.Frame(
        stack,
        bg=hub_theme.CARD,
        highlightthickness=hub_theme.PAD_UTIL_SHELL_OUTLINE,
        highlightbackground=hub_theme.BORDER,
        padx=2,
        pady=2,
    )
    shell.pack(
        fill=tk.BOTH,
        expand=True,
        padx=0,
        pady=hub_theme.PAD_UTIL_SHELL_BOTTOM,
    )

    px, py = hub_theme.PAD_UTIL_INNER_X, hub_theme.PAD_UTIL_INNER_Y
    top_body = hub_theme.GAP_SECTION if (заголовок or подзаголовок) else 0

    if заголовок or подзаголовок:
        header_inner = tk.Frame(shell, bg=hub_theme.CARD)
        header_inner.pack(fill=tk.X, padx=px, pady=(py, 0))
        if заголовок:
            ttk.Label(header_inner, text=заголовок, style="CardTitle.TLabel").pack(anchor=tk.W)
        if подзаголовок:
            ttk.Label(header_inner, text=подзаголовок, style="MutedCard.TLabel").pack(anchor=tk.W, pady=(4, 0))

    body = tk.Frame(shell, bg=hub_theme.CARD)
    body.pack(fill=tk.BOTH, expand=True, padx=px, pady=(top_body, py))

    return wrap, body
