# -*- coding: utf-8 -*-
"""
Единый полноэкранный фон хаба: приоритет локальных PNG в «Данные/»
(«фон_хаба.png» → «фон_рабочей_зоны.png» → «фон_сайдбара.png»), иначе кэш Unsplash.
Один и тот же файл используется для холста и сайдбара (см. ``путь_единого_фона_хаба``).
Только стандартная библиотека (urllib + ssl). Если файл недоступен — вернёт None (рисуем градиент в Окно).
"""

from __future__ import annotations

import os
import ssl
import urllib.request

# Строительная тематика (Unsplash License — свободное использование в приложениях, ссылка-атрибуция желательна в «О программе»).
# Несколько URL: fm=png — чтобы Tk.PhotoImage гарантированно открыл файл без Pillow.
_URLS_ФОНА: tuple[str, ...] = (
    "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&w=1920&q=80&fm=png",
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&w=1920&q=80&fm=png",
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&w=1920&q=80&fm=png",
)

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 PTO-Hub/1"
)


def путь_кэша(корень_хаба: str) -> str:
    return os.path.join(корень_хаба, "Данные", "фон_unsplash_стройка.png")


def путь_фона_рабочей_зоны(корень_хаба: str) -> str:
    """Пользовательский / поставочный PNG для хаба (приоритет над Unsplash-кэшем)."""
    return os.path.join(корень_хаба, "Данные", "фон_рабочей_зоны.png")


def путь_фона_хаба(корень_хаба: str) -> str:
    """Рекомендуемое имя одного файла обоев на всё окно хаба."""
    return os.path.join(корень_хаба, "Данные", "фон_хаба.png")


def путь_фона_сайдбара(корень_хаба: str) -> str:
    """Устаревшее имя файла; учитывается в ``локальный_кэш_если_готов`` после фона хаба и рабочей зоны."""
    return os.path.join(корень_хаба, "Данные", "фон_сайдбара.png")


def путь_единого_фона_хаба(корень_хаба: str, путь_активный: str | None) -> str | None:
    """Один файл для всего окна: актуальный путь после загрузки или первый доступный локальный PNG."""
    if путь_активный and _валидный_png_путь(путь_активный):
        return путь_активный
    return локальный_кэш_если_готов(корень_хаба)


def путь_фона_для_сайдбара(корень_хаба: str, путь_фона_героя: str | None) -> str | None:
    """Совместимость со старым именем — то же, что ``путь_единого_фона_хаба``."""
    return путь_единого_фона_хаба(корень_хаба, путь_фона_героя)


def _валидный_png_путь(path: str) -> bool:
    try:
        return os.path.isfile(path) and os.path.getsize(path) > 2000
    except Exception:
        return False


def локальный_кэш_если_готов(корень_хаба: str) -> str | None:
    """Без сети: первый доступный PNG «Данные/» или кэш Unsplash."""
    for path in (
        путь_фона_хаба(корень_хаба),
        путь_фона_рабочей_зоны(корень_хаба),
        путь_фона_сайдбара(корень_хаба),
        путь_кэша(корень_хаба),
    ):
        if _валидный_png_путь(path):
            return path
    return None


def обеспечить_фоновый_файл(корень_хаба: str, записать_журнал) -> str | None:
    """
    Возвращает путь к PNG в кэше или None, если скачать не удалось.
    При успешной загрузке файл лежит в «Данные/фон_unsplash_стройка.png».
    """
    папка = os.path.join(корень_хаба, "Данные")
    try:
        os.makedirs(папка, exist_ok=True)
    except Exception:
        pass
    path = путь_кэша(корень_хаба)
    hit = локальный_кэш_если_готов(корень_хаба)
    if hit:
        return hit
    last_err: Exception | None = None
    try:
        ctx = ssl.create_default_context()
        data: bytes | None = None
        for url in _URLS_ФОНА:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": _UA})
                with urllib.request.urlopen(req, context=ctx, timeout=22) as resp:
                    data = resp.read()
                if data and len(data) >= 2000:
                    break
                data = None
            except Exception as e:
                last_err = e
                data = None
        if not data or len(data) < 2000:
            raise RuntimeError(f"не удалось скачать ни один URL фона; последняя ошибка: {last_err!r}")
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
        записать_журнал(
            "Фон (строительная тематика, Unsplash) сохранён в кэш «Данные/фон_unsplash_стройка.png»",
            "INFO",
        )
        return path
    except Exception as e:
        try:
            записать_журнал(f"Не удалось загрузить фон из сети: {e}", "INFO")
        except Exception:
            pass
        return None
