# -*- coding: utf-8 -*-
"""
Сканирование папки «Утилиты»: подпапки с файлом «Запуск.py» считаются утилитами.
Читает необязательный «Обозначение.txt» (UTF-8).
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field


@dataclass
class УтилитаИнфо:
    """Описание одной найденной утилиты (имя папки — уникальный ключ)."""
    ключ: str  # имя папки
    путь_папки: str
    путь_запуск: str
    название: str
    иконка: str
    теги: list[str] = field(default_factory=list)
    описание: str = ""  # короткая подпись для меню (опционально, из Обозначение.txt)


def _разобрать_обозначение(путь_к_файлу: str) -> tuple[str, str, list[str], str]:
    """
    Возвращает (название, иконка, теги, описание).
    Если файла нет или ошибка — ('', '⚙️', [], '').
    """
    название = ""
    иконка = "⚙️"
    теги: list[str] = []
    описание = ""
    if not os.path.isfile(путь_к_файлу):
        return название, иконка, теги, описание
    try:
        with open(путь_к_файлу, "r", encoding="utf-8", errors="replace") as f:
            for raw in f:
                line = raw.strip()
                if line.lower().startswith("название:"):
                    название = line.split(":", 1)[1].strip()
                elif line.lower().startswith("иконка:"):
                    иконка = line.split(":", 1)[1].strip() or "⚙️"
                elif line.lower().startswith("теги:"):
                    rest = line.split(":", 1)[1].strip()
                    теги = [t.strip() for t in re.split(r"[,;]", rest) if t.strip()]
                elif line.lower().startswith("описание:"):
                    описание = line.split(":", 1)[1].strip()
    except Exception:
        pass
    return название, иконка, теги, описание


def сканировать(корень_хаба: str) -> list[УтилитаИнфо]:
    """
    Возвращает список утилит, отсортированный по имени папки.
    Папки без Запуск.py игнорируются.
    """
    папка = os.path.join(корень_хаба, "Утилиты")
    if not os.path.isdir(папка):
        return []
    result: list[УтилитаИнфо] = []
    try:
        for name in sorted(os.listdir(папка), key=str.lower):
            sub = os.path.join(папка, name)
            if not os.path.isdir(sub):
                continue
            запуск = os.path.join(sub, "Запуск.py")
            if not os.path.isfile(запуск):
                continue
            обозн = os.path.join(sub, "Обозначение.txt")
            n_title, icon, tags, blurb = _разобрать_обозначение(обозн)
            display = n_title if n_title else name
            result.append(
                УтилитаИнфо(
                    ключ=name,
                    путь_папки=sub,
                    путь_запуск=запуск,
                    название=display,
                    иконка=icon,
                    теги=tags,
                    описание=blurb,
                )
            )
    except Exception:
        return result
    return result


def совпадает_с_поиском(info: УтилитаИнфо, запрос: str) -> bool:
    """Фильтр по названию, имени папки и тегам (без учёта регистра)."""
    if not запрос or not запрос.strip():
        return True
    q = запрос.strip().lower()
    blob = " ".join(
        [
            info.название.lower(),
            info.ключ.lower(),
            info.описание.lower(),
            " ".join(t.lower() for t in info.теги),
        ]
    )
    return q in blob or all(word in blob for word in q.split() if word)
