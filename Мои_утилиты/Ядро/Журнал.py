# -*- coding: utf-8 -*-
"""
Журнал событий хаба утилит.
Пишет строки в файл, при переполнении (>500 строк) обрезает до 200 последних.
Все ошибки и события логируются здесь — сбой записи не должен ронять программу.
"""

from __future__ import annotations

import os
from collections import deque
from datetime import datetime
from threading import Lock

# Максимум строк в файле до обрезки; после обрезки оставляем столько последних
_MAX_LINES = 500
_KEEP_LINES = 200

_lock = Lock()


def _путь_журнала(корень_хаба: str) -> str:
    """Файл журнала лежит рядом с Запустить.py."""
    return os.path.join(корень_хаба, "Журнал.txt")


def записать(корень_хаба: str, сообщение: str, уровень: str = "INFO") -> None:
    """
    Добавляет одну строку в журнал с меткой времени.
    уровень: INFO, WARN, ERROR и т.п.
    """
    try:
        путь = _путь_журнала(корень_хаба)
        строка = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} [{уровень}] {сообщение}\n"
        with _lock:
            os.makedirs(os.path.dirname(путь) or ".", exist_ok=True)
            with open(путь, "a", encoding="utf-8") as f:
                f.write(строка)
            _обрезать_если_нужно(путь)
    except Exception:
        # Журнал не должен ломать приложение
        pass


def _обрезать_если_нужно(путь: str) -> None:
    """Если строк больше _MAX_LINES — оставляем только последние _KEEP_LINES.

    Один поток по файлу без загрузки всех строк в список: память O(_KEEP_LINES).
    Запись во временный файл и os.replace — целостность при сбое во время trim.
    """
    try:
        if not os.path.isfile(путь):
            return
        dq = deque(maxlen=_KEEP_LINES)
        count = 0
        with open(путь, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                count += 1
                dq.append(line)
        if count <= _MAX_LINES:
            return
        tmp = путь + ".trim.tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.writelines(dq)
        os.replace(tmp, путь)
    except Exception:
        try:
            t = путь + ".trim.tmp"
            if os.path.isfile(t):
                os.unlink(t)
        except Exception:
            pass
