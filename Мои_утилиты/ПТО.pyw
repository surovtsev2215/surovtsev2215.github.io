# -*- coding: utf-8 -*-
"""
ПТО — запуск хаба утилит без окна консоли (открывайте этот файл или ярлык «ПТО»).
Реализация остаётся в Запустить.py.
"""

from __future__ import annotations

import os
import runpy

_каталог = os.path.dirname(os.path.abspath(__file__))
_цель = os.path.join(_каталог, "Запустить.py")
runpy.run_path(_цель, run_name="__main__")
