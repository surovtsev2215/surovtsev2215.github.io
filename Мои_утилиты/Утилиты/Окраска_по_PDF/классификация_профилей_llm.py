# -*- coding: utf-8 -*-
"""
Батч-классификация неузнанных обозначений профиля (только подсказка ключа для CSV).
Не подставляет м² из ответа модели — только сопоставление с существующими ключами каталога.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

SCHEMA_VERSION = 1
PROMPT_VERSION = 1

_SYSTEM = """Ты помогаешь сопоставить строку профиля из ведомости КМД/CSV с ключом каталога.
Ответ ТОЛЬКО JSON-объект с полем schema_version (число) и массивом items.
Каждый элемент: raw (строка, как во входе), kind (plate|rolled|angle|pipe|unknown), key_hint (string|null).
Для полосы/листа key_hint = «ширинаммxтолщинамм» в миллиметрах, например 90x10, без пробелов.
Для двутавра/швеллера — короткий slug как во внутреннем учёте: 40к2, 30ш1, 20п и т.п.
Если не уверен — kind=unknown и key_hint=null. Не придумывай ключи без оснований в строке raw."""


def _cache_file(util_dir: str) -> str:
    return os.path.join(util_dir, "profile_classify_cache.json")


def _entry_sig(canonical_raw: str) -> str:
    blob = f"{SCHEMA_VERSION}:{PROMPT_VERSION}:{canonical_raw}".encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:48]


def _load_cache(util_dir: str) -> dict[str, Any]:
    path = _cache_file(util_dir)
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return dict(json.load(f))
    except Exception:
        return {}


def _save_cache(util_dir: str, data: dict[str, Any]) -> None:
    path = _cache_file(util_dir)
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    except OSError:
        pass


def classify_unknown_profiles_with_llm(
    util_dir: str,
    canonical_raw_strings: list[str],
    *,
    max_items: int = 32,
    timeout_sec: float = 45.0,
) -> dict[str, str]:
    """
    Вход: уже нормализованные canonical-ключи (как profile_raw_canonical_key).
    Возвращает {каноническая_строка: key_hint или пустая строка}.
    """
    out: dict[str, str] = {}
    util_dir = (util_dir or "").strip()
    if not util_dir or not canonical_raw_strings:
        return out

    try:
        from ассистент_llm import post_chat_json, прочитать_конфиг
    except ImportError:
        return out

    cfg = прочитать_конфиг(util_dir)
    if not bool(cfg.get("profile_classify_llm")):
        return out

    lim = max(1, min(int(cfg.get("profile_classify_max_items") or max_items), 64))
    to = float(cfg.get("profile_classify_timeout_sec") or timeout_sec)

    uniq: list[str] = []
    seen: set[str] = set()
    for x in canonical_raw_strings:
        t = str(x).strip()
        if not t or len(t) < 3 or len(t) > 260:
            continue
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    if not uniq:
        return out

    cache_all = _load_cache(util_dir)

    def _recover_from_full_cache(can: str, sig: str) -> None:
        ent_any = cache_all.get(sig)
        if isinstance(ent_any, dict):
            kh = ent_any.get("key_hint")
            if isinstance(kh, str) and kh.strip():
                out[can] = kh.strip()
            return
        legacy = cache_all.get(f"legacy:{can}")
        if isinstance(legacy, dict):
            kh = legacy.get("key_hint")
            if isinstance(kh, str) and kh.strip():
                out[can] = kh.strip()

    pending: list[str] = []
    cache_dirty = False
    for can in uniq[:lim]:
        sig = _entry_sig(can)
        ent = cache_all.get(sig)
        if isinstance(ent, dict) and isinstance(ent.get("key_hint"), str):
            kh = ent.get("key_hint") or ""
            if kh.strip():
                out[can] = kh.strip()
            continue
        _recover_from_full_cache(can, sig)
        if can in out:
            continue
        pending.append(can)

    if not pending:
        return out

    user_blob = json.dumps(
        {"schema_version": SCHEMA_VERSION, "items": [{"raw": s} for s in pending]},
        ensure_ascii=False,
    )
    data, err = post_chat_json(
        util_dir,
        system=_SYSTEM,
        user_content=user_blob + "\n\nВерни JSON с заполненным items[].",
        timeout_sec=to,
        temperature=0.1,
    )
    if not data:
        cache_all["_last_llm_profile_error"] = str(err or "empty")
        _save_cache(util_dir, cache_all)
        return out

    items = data.get("items")
    if not isinstance(items, list):
        return out

    from ведомость_металл import profile_raw_canonical_key

    canon_to_pending: dict[str, str] = {}
    for can in pending:
        canon_to_pending[profile_raw_canonical_key(can)] = can

    for it in items:
        if not isinstance(it, dict):
            continue
        raw = str(it.get("raw") or "").strip()
        kh = it.get("key_hint")
        if not (isinstance(kh, str) and kh.strip()):
            continue
        kk = kh.strip().lower().replace("х", "x")
        can = canon_to_pending.get(raw) or canon_to_pending.get(profile_raw_canonical_key(raw))
        if not can:
            continue
        out[can] = kk
        sig = _entry_sig(can)
        cache_all[sig] = {"key_hint": kk, "kind": str(it.get("kind") or "")}
        cache_dirty = True

    if cache_dirty:
        _save_cache(util_dir, cache_all)
    return out
