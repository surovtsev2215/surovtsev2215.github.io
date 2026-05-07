# -*- coding: utf-8 -*-
"""Точечные проверки сканера утилит хаба (без tkinter)."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ЯДРО = os.path.join(_REPO, "Мои_утилиты", "Ядро")
sys.path.insert(0, _ЯДРО)

import Сканер  # type: ignore  # noqa: E402


class TestHubScanner(unittest.TestCase):
    def test_scan_finds_launch_and_oboznachenie(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            util_dir = os.path.join(tmp, "Утилиты", "Тест_У")
            os.makedirs(util_dir)
            with open(os.path.join(util_dir, "Запуск.py"), "w", encoding="utf-8") as fh:
                fh.write("def запустить(родитель):\n    pass\n")
            with open(os.path.join(util_dir, "Обозначение.txt"), "w", encoding="utf-8") as fh:
                fh.write(
                    "Название: Моя утилита\nИконка: 🔧\nТеги: тест, демо\nОписание: Для меню справа\n"
                )
            infos = Сканер.сканировать(tmp)
            self.assertEqual(len(infos), 1)
            u = infos[0]
            self.assertEqual(u.ключ, "Тест_У")
            self.assertEqual(u.название, "Моя утилита")
            self.assertEqual(u.иконка, "🔧")
            self.assertEqual(u.теги, ["тест", "демо"])
            self.assertEqual(u.описание, "Для меню справа")

    def test_scan_without_oboznachenie_uses_folder_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            util_dir = os.path.join(tmp, "Утилиты", "ПапкаБезОбозн")
            os.makedirs(util_dir)
            with open(os.path.join(util_dir, "Запуск.py"), "w", encoding="utf-8") as fh:
                fh.write("def запустить(родитель):\n    pass\n")
            infos = Сканер.сканировать(tmp)
            self.assertEqual(len(infos), 1)
            self.assertEqual(infos[0].название, "ПапкаБезОбозн")

    def test_search_substring_and_words(self) -> None:
        info = Сканер.УтилитаИнфо(
            ключ="Кальк",
            путь_папки="/tmp/x",
            путь_запуск="/tmp/x/Z.py",
            название="Калькулятор металла",
            иконка="⚙️",
            теги=["металл"],
        )
        self.assertTrue(Сканер.совпадает_с_поиском(info, "металл"))
        self.assertTrue(Сканер.совпадает_с_поиском(info, "кальк металл"))
        self.assertFalse(Сканер.совпадает_с_поиском(info, "pdf-only"))

    def test_search_includes_description(self) -> None:
        info = Сканер.УтилитаИнфо(
            ключ="X",
            путь_папки="/tmp/x",
            путь_запуск="/tmp/x/Z.py",
            название="Утилита",
            иконка="⚙️",
            теги=[],
            описание="Только в подписи меню",
        )
        self.assertTrue(Сканер.совпадает_с_поиском(info, "подписи"))


if __name__ == "__main__":
    unittest.main()
