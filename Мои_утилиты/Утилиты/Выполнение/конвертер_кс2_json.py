# -*- coding: utf-8 -*-
"""CLI: разобрать КС-2 Excel и сохранить JSON для импорта в хранилище."""

from __future__ import annotations

import argparse
import os
import sys

import кс2_разбор as ks2


def main() -> int:
    ap = argparse.ArgumentParser(description="Конвертер КС-2: Excel -> JSON результата")
    ap.add_argument("input", help="Путь к .xlsx файлу КС-2")
    ap.add_argument(
        "-o",
        "--output",
        help="Путь к .json (по умолчанию рядом с исходным файлом)",
        default="",
    )
    args = ap.parse_args()

    src = os.path.normpath(args.input)
    if not os.path.isfile(src):
        print(f"Файл не найден: {src}")
        return 2

    out = args.output.strip()
    if not out:
        base, _ = os.path.splitext(src)
        out = base + ".ks2.json"
    out = os.path.normpath(out)

    res = ks2.разобрать_документ(src)
    if res.ошибка:
        print(f"Ошибка разбора: {res.ошибка}")
        return 1

    ks2.экспортировать_результат_в_json(res, out)
    print(f"Готово: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
