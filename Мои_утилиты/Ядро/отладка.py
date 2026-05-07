# -*- coding: utf-8 -*-
"""
Запись отладочных строк NDJSON в корень репозитория (рядом с папкой «Мои_утилиты»).

Включение: переменная окружения PTO_DEBUG=1 (или true / yes, без учёта регистра).
Без неё функции — no-op: пользовательские каталоги не засоряются.
"""

from __future__ import annotations

import json
import os
import time


def включена() -> bool:
    return os.environ.get("PTO_DEBUG", "").strip().lower() in ("1", "true", "yes")


def корень_репозитория() -> str:
    """Родитель каталога «Мои_утилиты» (файл лежит в Мои_утилиты/Ядро/)."""
    ядро = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(os.path.dirname(ядро))


def записать(данные: dict) -> None:
    """Дописывает одну строку JSON в debug-pto-hub.jsonl при включённой отладке."""
    if not включена():
        return
    root = корень_репозитория()
    row = {"timestamp_ms": int(time.time() * 1000), **данные}
    path = os.path.join(root, "debug-pto-hub.jsonl")
    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception:
        pass


def записать_из_утилиты(абсолютный_файл_модуля: str, данные: dict) -> None:
    """
    Для скриптов внутри Мои_утилиты/Утилиты/… — тот же файл debug-pto-hub.jsonl,
    если задана PTO_DEBUG (удобно отлаживать утилиты без импорта Ядро).
    """
    if not включена():
        return
    d = os.path.dirname(os.path.abspath(абсолютный_файл_модуля))
    корень_хаба = d
    for _ in range(12):
        parent = os.path.dirname(корень_хаба)
        if parent == корень_хаба:
            break
        base = os.path.basename(корень_хаба)
        if base == "Мои_утилиты":
            repo = parent
            row = {"timestamp_ms": int(time.time() * 1000), **данные}
            path = os.path.join(repo, "debug-pto-hub.jsonl")
            try:
                with open(path, "a", encoding="utf-8") as fh:
                    fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            except Exception:
                pass
            return
        корень_хаба = parent
