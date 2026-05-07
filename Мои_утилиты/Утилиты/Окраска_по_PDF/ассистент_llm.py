# -*- coding: utf-8 -*-
"""
Чат-ассистент для калькулятора АКЗ: запрос к OpenAI-совместимому Chat Completions API (urllib).
Ответ только JSON: assistant_message + actions[].

Файл настроек рядом с утилитой: assistant_config.json
"""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request
from typing import Any

_SCHEMA_HINT = """
Ты помощник для утилиты «Калькулятор АКЗ по PDF». Отвечай ТОЛЬКО одним JSON-объектом (без markdown).

Поля корня:
- "assistant_message": string — коротко по-русски, что сделаешь или что уточнить.
- "actions": array — действия по порядку.

Типы действий (поле "type"):
1) SET_AXIS_RANGE — задать зоны по номерам осей под имена файлов как пресет «Оси 1–3»: поля from (int), to (int), replace (bool).
2) SET_AXIS_LIST — то же для списка: axes (array целых), replace (bool).
3) SET_AXIS_CUSTOM — передать группы как в программе: groups — массив {name, file_re, mark_re?}; каждый file_re и mark_re должен быть валидным regex или пустой mark_re.
4) SET_GOAL — goal: "metal" | "sheet".
5) RUN_ANALYZE — запустить расчёт по всем PDF проекта (пустой объект или без лишних полей).
6) SAVE_PROJECT — сохранить проект JSON (если открыт проект или есть файлы).
7) EXPORT_XLSX — экспорт Excel; path — строка полного пути .xlsx или null чтобы программа сама предложила диалог после расчёта.
8) NONE — только текст в assistant_message, действий нет.

Правила:
- Не выдумывай имена файлов; используй контекст пользователя.
- Если пользователь просит «оси N–M», используй SET_AXIS_RANGE с replace:true если явно «замени правила» иначе можно replace:false если добавить — но проще всегда replace:true для явных диапазонов осей.
- Для типичных форматов имён КМ «…_1…pdf» паттерн уже зашит в программе через SET_AXIS_RANGE/LIST — не генерируй file_re сам, если достаточно номеров осей.
- Если данных мало (нет PDF в проекте), верни NONE и попроси добавить файлы или открыть проект.

Пример ответа:
{"assistant_message":"Задаю зоны осей 1–3 и запускаю анализ в режиме металла.","actions":[{"type":"SET_GOAL","goal":"metal"},{"type":"SET_AXIS_RANGE","from":1,"to":3,"replace":true},{"type":"RUN_ANALYZE"}]}
"""


def путь_конфига(утил_dir: str) -> str:
    return os.path.join(утил_dir, "assistant_config.json")


def прочитать_конфиг(утил_dir: str) -> dict[str, Any]:
    path = путь_конфига(утил_dir)
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return dict(json.load(f))
    except Exception:
        return {}


def сохранить_конфиг(утил_dir: str, data: dict[str, Any]) -> None:
    path = путь_конфига(утил_dir)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def построить_контекст(
    *,
    pdf_basenames: list[str],
    axis_groups: list[dict[str, str]],
    goal: str,
    project_path: str | None,
    app_version: str,
) -> dict[str, Any]:
    return {
        "app": "Калькулятор АКЗ по PDF",
        "app_version": app_version,
        "project_json_path": project_path,
        "goal_current": goal,
        "pdf_files": pdf_basenames,
        "axis_groups": axis_groups,
        "hint": "Зоны матчят имена файлов сверху вниз по regex file_re; марка ведомости — опционально mark_re.",
    }


def post_chat_json(
    утил_dir: str,
    *,
    system: str,
    user_content: str | list[dict[str, Any]],
    model: str | None = None,
    timeout_sec: float = 120.0,
    temperature: float = 0.15,
) -> tuple[dict[str, Any] | None, str]:
    """
    Общий POST /v1/chat/completions с response_format json_object.
    user_content — либо строка, либо список частей OpenAI (text + image_url).
    """
    cfg = прочитать_конфиг(утил_dir)
    api_key = (cfg.get("api_key") or os.environ.get("OPENAI_API_KEY") or "").strip()
    base_url = (cfg.get("base_url") or "https://api.openai.com/v1").strip().rstrip("/")
    mdl = ((model if model is not None else None) or cfg.get("model") or "gpt-4o-mini").strip()
    if not api_key:
        return None, "Нет API-ключа: заполните assistant_config.json (поле api_key) или OPENAI_API_KEY."

    if isinstance(user_content, str):
        user_msg: dict[str, Any] = {"role": "user", "content": user_content}
    else:
        user_msg = {"role": "user", "content": user_content}

    payload: dict[str, Any] = {
        "model": mdl,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            user_msg,
        ],
    }
    body = json.dumps(payload).encode("utf-8")
    url = base_url + "/chat/completions"
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "PTO-AKZ-merged/1",
        },
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode("utf-8", errors="replace")[:800]
        except Exception:
            detail = ""
        return None, f"HTTP {e.code}: {detail or e.reason}"
    except Exception as e:
        return None, str(e)

    try:
        api_resp = json.loads(raw)
        choices = api_resp.get("choices") or []
        if not choices:
            return None, "Пустой ответ API."
        msg = (choices[0].get("message") or {}).get("content") or ""
        out = json.loads(msg)
    except Exception as e:
        return None, f"Разбор ответа модели: {e}"
    if not isinstance(out, dict):
        return None, "Ответ не объект JSON."
    return out, ""


def запросить_план(
    утил_dir: str,
    user_text: str,
    context: dict[str, Any],
    *,
    timeout_sec: float = 120.0,
) -> tuple[dict[str, Any] | None, str]:
    cfg = прочитать_конфиг(утил_dir)
    api_key = (cfg.get("api_key") or os.environ.get("OPENAI_API_KEY") or "").strip()
    model = (cfg.get("model") or "gpt-4o-mini").strip()
    if not api_key:
        return None, "Нет API-ключа: заполните assistant_config.json (поле api_key) или переменную окружения OPENAI_API_KEY."

    plan, err = post_chat_json(
        утил_dir,
        system=_SCHEMA_HINT,
        user_content=json.dumps({"context": context, "message": user_text}, ensure_ascii=False),
        model=model,
        timeout_sec=timeout_sec,
        temperature=0.2,
    )
    if err or not plan:
        return None, err

    if not isinstance(plan, dict):
        return None, "Ответ не объект JSON."
    err = провалидировать_план(plan)
    if err:
        return None, err
    return plan, ""


def провалидировать_план(plan: dict[str, Any]) -> str:
    if "assistant_message" not in plan:
        return 'В ответе нет поля "assistant_message".'
    acts = plan.get("actions")
    if acts is None:
        plan["actions"] = []
        return ""
    if not isinstance(acts, list):
        return '"actions" должен быть массивом.'
    import re as _re

    for i, act in enumerate(acts):
        if not isinstance(act, dict):
            return f"Действие #{i+1}: не объект."
        t = act.get("type")
        if t not in (
            "SET_AXIS_RANGE",
            "SET_AXIS_LIST",
            "SET_AXIS_CUSTOM",
            "SET_GOAL",
            "RUN_ANALYZE",
            "SAVE_PROJECT",
            "EXPORT_XLSX",
            "NONE",
        ):
            return f"Неизвестный тип действия: {t!r}"
        if t == "SET_AXIS_RANGE":
            if not all(k in act for k in ("from", "to")):
                return "SET_AXIS_RANGE: нужны from, to."
            if int(act["from"]) > int(act["to"]):
                return "SET_AXIS_RANGE: from > to."
        if t == "SET_AXIS_LIST":
            axes = act.get("axes")
            if not isinstance(axes, list) or not axes:
                return "SET_AXIS_LIST: нужен непустой axes[]."
        if t == "SET_AXIS_CUSTOM":
            gr = act.get("groups")
            if not isinstance(gr, list) or not gr:
                return "SET_AXIS_CUSTOM: нужен groups[]."
            for j, g in enumerate(gr):
                if not isinstance(g, dict):
                    return f"g[{j}] не объект."
                fr = (g.get("file_re") or "").strip()
                if not fr:
                    return f"g[{j}]: пустой file_re."
                try:
                    _re.compile(fr, _re.I)
                except _re.error as e:
                    return f"g[{j}]: неверный file_re: {e}"
                mr = (g.get("mark_re") or "").strip()
                if mr:
                    try:
                        _re.compile(mr, _re.I)
                    except _re.error as e:
                        return f"g[{j}]: неверный mark_re: {e}"
        if t == "SET_GOAL":
            if act.get("goal") not in ("metal", "sheet"):
                return 'SET_GOAL: goal должен быть "metal" или "sheet".'
        if t == "EXPORT_XLSX":
            pth = act.get("path")
            if pth is not None and not isinstance(pth, str):
                return "EXPORT_XLSX: path должен быть строкой или null."
    return ""
