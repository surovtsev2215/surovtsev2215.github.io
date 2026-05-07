# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import sys
import unittest

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_KS2_DIR = os.path.join(_REPO, "Мои_утилиты", "Утилиты", "Выполнение")
sys.path.insert(0, _KS2_DIR)

import кс2_разбор as ks2  # type: ignore  # noqa: E402


class TestKs2VolumeParsing(unittest.TestCase):
    def test_qty_not_from_position_number_and_unit_from_template(self) -> None:
        # Эмулируем проблемный фрагмент КС-2:
        # col0 = номер позиции 1..N (не qty),
        # col1 = фактический объем,
        # col4 = шаблон с unit "1 м3 ..."
        rows = [
            [None, None, None, None, None],
            [1, "1,609", "ФЕР26-01", "Изоляция трубопроводов ...", "1 м3 конструкции"],
            [2, "5,101", "ФЕР26-03", "Изоляция трубопроводов ...", "1 м3 конструкции"],
            [3, "0,073", "ФЕР26-03", "Изоляция трубопроводов ...", "1 м3 конструкции"],
        ]
        col_roles = {3: "name"}  # qty/unit по заголовкам не определились
        nodes = ks2._собрать_узлы_позиций(rows, first_data_row_idx=1, col_roles=col_roles)
        self.assertGreaterEqual(len(nodes), 3)

        q = [(n.количество or "").strip() for n in nodes[:3]]
        u = [(n.единица or "").strip().lower() for n in nodes[:3]]

        # Не должно деградировать в 1/2/3 (номера позиций)
        self.assertNotEqual(q, ["1", "2", "3"])
        # Ожидаем фактические объёмы
        self.assertTrue(q[0].startswith("1,609"))
        self.assertTrue(q[1].startswith("5,101"))
        # Единица должна вытягиваться из шаблона
        self.assertTrue(all(x in ("м3", "м.3", "м 3") or x.startswith("м3") for x in u))

    def test_low_confidence_numbering_column_is_not_used_as_qty(self) -> None:
        # Есть только нумерация в ранних колонках, явного объема нет:
        # в таком случае qty не должен заполняться номерами.
        rows = [
            [None, None, None, None],
            [1, 1, "ФЕР", "Работа 1"],
            [2, 2, "ФЕР", "Работа 2"],
            [3, 3, "ФЕР", "Работа 3"],
            [4, 4, "ФЕР", "Работа 4"],
        ]
        col_roles = {3: "name"}
        nodes = ks2._собрать_узлы_позиций(rows, first_data_row_idx=1, col_roles=col_roles)
        self.assertGreaterEqual(len(nodes), 4)
        q = [(n.количество or "").strip() for n in nodes[:4]]
        self.assertTrue(all(v in ("", "—") for v in q))


if __name__ == "__main__":
    unittest.main()
