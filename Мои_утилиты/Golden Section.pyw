# -*- coding: utf-8 -*-
"""
Golden Section — запуск хаба утилит без окна консоли.
Реализация остаётся в Запустить.py.
"""

from __future__ import annotations

import os
import runpy

_каталог = os.path.dirname(os.path.abspath(__file__))
_цель = os.path.join(_каталог, "Запустить.py")
runpy.run_path(_цель, run_name="__main__")
