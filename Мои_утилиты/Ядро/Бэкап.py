# -*- coding: utf-8 -*-
"""
Ежедневный бэкап папки «Утилиты» и файла «Настройки.json» при запуске (раз в календарный день).
Хранит последние 5 копий; старые каталоги удаляются.
"""

from __future__ import annotations

import os
import shutil
from datetime import date

# Сколько последних бэкапов держим
_MAX_BACKUPS = 5


def _папка_бэкапов(корень_хаба: str) -> str:
    return os.path.join(корень_хаба, "Бэкапы")


def нужен_бэкап_сегодня(корень_хаба: str, последняя_дата: str | None) -> bool:
    """последняя_дата — строка YYYY-MM-DD из настроек или None."""
    сегодня = date.today().isoformat()
    return последняя_дата != сегодня


def выполнить_если_нужно(корень_хаба: str, записать_журнал, обновить_дату_в_настройках) -> None:
    """
    записать_журнал(msg, level)
    обновить_дату_в_настройках() — колбэк сохраняет сегодняшнюю дату last_backup_date
    """
    try:
        утилиты = os.path.join(корень_хаба, "Утилиты")
        настройки = os.path.join(корень_хаба, "Настройки.json")
        if not os.path.isdir(утилиты):
            os.makedirs(утилиты, exist_ok=True)

        dst_root = _папка_бэкапов(корень_хаба)
        os.makedirs(dst_root, exist_ok=True)

        метка = date.today().strftime("%Y%m%d_%H%M%S")
        target = os.path.join(dst_root, f"backup_{метка}")
        os.makedirs(target, exist_ok=True)

        # Копируем всю папку утилит
        shutil.copytree(утилиты, os.path.join(target, "Утилиты"), dirs_exist_ok=True)
        if os.path.isfile(настройки):
            shutil.copy2(настройки, os.path.join(target, "Настройки.json"))

        записать_журнал("Выполнен ежедневный бэкап: " + target, "INFO")
        обновить_дату_в_настройках()
        _удалить_старые(dst_root, записать_журнал)
    except Exception as e:
        try:
            записать_журнал(f"Ошибка бэкапа: {e}", "ERROR")
        except Exception:
            pass


def _удалить_старые(dst_root: str, записать_журнал) -> None:
    """Оставляем только _MAX_BACKUPS самых новых по имени (дата в имени)."""
    try:
        names = [n for n in os.listdir(dst_root) if n.startswith("backup_")]
        names.sort(reverse=True)
        for old in names[_MAX_BACKUPS:]:
            path = os.path.join(dst_root, old)
            shutil.rmtree(path, ignore_errors=True)
            записать_журнал("Удалён старый бэкап: " + path, "INFO")
    except Exception as e:
        записать_журнал(f"Ошибка очистки бэкапов: {e}", "WARN")
