# -*- coding: utf-8 -*-
"""
Точка входа «Хаб утилит» (консоль видна при запуске через python).
Для работы без чёрного окна откройте ПТО.pyw, ПТО.vbs в корне проекта или ярлык «ПТО» (см. create_pto_shortcut.ps1).
"""

from __future__ import annotations

import os
import sys


def main() -> None:
    корень = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(корень, "Утилиты"), exist_ok=True)
    ядро = os.path.join(корень, "Ядро")
    os.makedirs(ядро, exist_ok=True)
    if ядро not in sys.path:
        sys.path.insert(0, ядро)

    import отладка  # type: ignore

    _ht = os.path.join(ядро, "hub_theme.py")
    отладка.записать(
        {
            "location": "Запустить.py:main",
            "message": "pre_import_paths",
            "data": {"ядро": ядро, "hub_theme_exists": os.path.isfile(_ht), "hub_theme_path": _ht},
        }
    )

    # Динамический импорт модуля с кириллическим именем файла «Окно.py»
    import importlib.util

    путь_окно = os.path.join(ядро, "Окно.py")
    spec = importlib.util.spec_from_file_location("хаб_окно", путь_окно)
    if spec is None or spec.loader is None:
        raise RuntimeError("Не найден файл Ядро/Окно.py")
    мод = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(мод)  # type: ignore
    отладка.записать({"location": "Запустить.py:main", "message": "exec_module_ok", "главная": hasattr(мод, "главная")})
    мод.главная(корень)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Последняя линия защиты: не падаем молча, показываем диалог если возможно
        try:
            import tkinter as tk
            from tkinter import messagebox

            r = tk.Tk()
            r.withdraw()
            messagebox.showerror("Golden Section", f"Критическая ошибка запуска:\n{e}")
            r.destroy()
        except Exception:
            print("Ошибка:", e)
        sys.exit(1)
