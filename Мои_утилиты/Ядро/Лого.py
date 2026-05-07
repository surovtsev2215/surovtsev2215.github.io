# -*- coding: utf-8 -*-
"""
Логотип в шапке сайдбара: PNG «Данные/лого_hub_brand.png» (при наличии).

Если файла нет — подставляется загрузка с CDN (Twemoji: молот/ключ и т.п.) как запасной вариант.

Только стандартная библиотека (urllib + ssl); отображение через Tk.PhotoImage — файл должен быть корректным PNG.
"""

from __future__ import annotations

import os
import ssl
import urllib.request

# Активный форк коллекции Twemoji на jsDelivr (репозиторий jdecked/twemoji — лицензия как у проекта Emoji).
_URLS_LOGO: tuple[str, ...] = (
    "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/1f6e0.png",
    "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/2692.png",
    "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/1f528.png",
)

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 PTO-Hub/1"
)


def путь_кэша(корень_хаба: str) -> str:
    return os.path.join(корень_хаба, "Данные", "лого_hub_brand.png")


def локальный_кэш_если_готов(корень_хаба: str) -> str | None:
    path = путь_кэша(корень_хаба)
    try:
        if os.path.isfile(path) and os.path.getsize(path) > 400:
            return path
    except Exception:
        pass
    return None


def обеспечить_лого_файл(корень_хаба: str, записать_журнал) -> str | None:
    """Если локального PNG ещё нет — пробует скачать запасное изображение в «Данные/лого_hub_brand.png»."""
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
    data: bytes | None = None
    try:
        ctx = ssl.create_default_context()
        for url in _URLS_LOGO:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": _UA})
                with urllib.request.urlopen(req, context=ctx, timeout=14) as resp:
                    data = resp.read()
                if data and len(data) >= 400:
                    break
                data = None
            except Exception as e:
                last_err = e
                data = None
        if not data:
            raise RuntimeError(f"лого не скачано: {last_err!r}")
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
        записать_журнал(
            "Запасное лого сайдбара (Twemoji CDN) сохранено в «Данные/лого_hub_brand.png»",
            "INFO",
        )
        return path
    except Exception as e:
        try:
            записать_журнал(f"Не удалось загрузить лого сайдбара: {e}", "INFO")
        except Exception:
            pass
        return None
