# -*- coding: utf-8 -*-
"""
Загрузка общего каталога м²/п.м по HTTPS в локальный кеш (CSV).
Локальный профили_м2_на_пм.csv по-прежнему перекрывает все слои при merge.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CONFIG_FILENAME = "каталог_url.json"
CACHE_CSV_NAME = "профили_база_облако.csv"
META_FILENAME = "каталог_облако_meta.json"

_DEFAULT_CONFIG: dict[str, Any] = {
    "enabled": False,
    "url": "",
    "timeout_sec": 25,
    "fetch_on_analyze": False,
}


def _bundle_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def config_path() -> str:
    return os.path.join(_bundle_dir(), CONFIG_FILENAME)


def cache_csv_path() -> str:
    return os.path.join(_bundle_dir(), CACHE_CSV_NAME)


def meta_path() -> str:
    return os.path.join(_bundle_dir(), META_FILENAME)


def read_config() -> dict[str, Any]:
    p = config_path()
    if not os.path.isfile(p):
        return dict(_DEFAULT_CONFIG)
    try:
        with open(p, encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            return dict(_DEFAULT_CONFIG)
        out = dict(_DEFAULT_CONFIG)
        out.update(raw)
        out["timeout_sec"] = max(5, min(120, int(out.get("timeout_sec") or 25)))
        out["url"] = str(out.get("url") or "").strip()
        out["enabled"] = bool(out.get("enabled"))
        out["fetch_on_analyze"] = bool(out.get("fetch_on_analyze"))
        return out
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return dict(_DEFAULT_CONFIG)


def write_config(cfg: dict[str, Any]) -> None:
    p = config_path()
    out = dict(_DEFAULT_CONFIG)
    out.update(cfg)
    out["timeout_sec"] = max(5, min(120, int(out.get("timeout_sec") or 25)))
    out["url"] = str(out.get("url") or "").strip()
    out["enabled"] = bool(out.get("enabled"))
    out["fetch_on_analyze"] = bool(out.get("fetch_on_analyze"))
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


def read_meta() -> dict[str, Any] | None:
    p = meta_path()
    if not os.path.isfile(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError, TypeError):
        return None


def catalog_summary_line() -> str:
    """Краткая строка для подсказки в UI / отчёте."""
    cfg = read_config()
    meta = read_meta()
    parts: list[str] = []
    if cfg.get("url"):
        parts.append("URL задан" if cfg.get("enabled") else "URL (выкл.)")
    else:
        parts.append("URL не задан")
    cp = cache_csv_path()
    if os.path.isfile(cp) and os.path.getsize(cp) > 32:
        if meta and isinstance(meta, dict):
            ver = meta.get("version") or meta.get("sha256_prefix") or "?"
            ts = meta.get("fetched_at") or ""
            parts.append(f"кеш {ver} {ts[:10]}")
        else:
            parts.append("кеш есть")
    else:
        parts.append("кеш пуст")
    return " · ".join(parts)


def fetch_remote_catalog() -> tuple[bool, str]:
    """
    Скачать CSV по url из конфига, записать в профили_база_облако.csv и meta.
    """
    cfg = read_config()
    url = cfg.get("url") or ""
    if not url:
        return False, "В настройках не указан URL каталога."
    to = float(cfg.get("timeout_sec") or 25)
    cache_p = cache_csv_path()
    meta_p = meta_path()
    req = Request(
        url,
        headers={
            "User-Agent": "PTO-AKZ-Utility/1.0 (+catalog)",
            "Accept": "text/csv,text/plain,*/*",
        },
    )
    try:
        with urlopen(req, timeout=to) as resp:  # noqa: S310 — URL из настроек пользователя
            data = resp.read()
    except HTTPError as e:
        return False, f"HTTP {e.code}: {e.reason}"
    except URLError as e:
        return False, f"Сеть: {e.reason!s}"
    except TimeoutError:
        return False, "Таймаут — увеличьте timeout в настройках или проверьте сеть."
    except OSError as e:
        return False, str(e)

    if not data or len(data) < 16:
        return False, "Пустой ответ сервера."

    text = data.decode("utf-8-sig", errors="replace")
    sample = text[:4096]
    if ";" not in sample and "," not in sample and "\t" not in sample:
        return False, "Ответ не похож на CSV (нет разделителей)."

    tmp = cache_p + ".tmp"
    try:
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, cache_p)
    except OSError as e:
        if os.path.isfile(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass
        return False, str(e)

    sha = hashlib.sha256(data).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    ver_m = re.search(r"(?:^|\n)\s*#\s*версия\s*[:=]\s*([^\n#]{1,64})", text, re.I | re.MULTILINE)
    version = (ver_m.group(1).strip() if ver_m else "") or sha[:12]
    meta = {
        "version": version,
        "sha256_full": sha,
        "sha256_prefix": sha[:16],
        "fetched_at": now,
        "size_bytes": len(data),
        "url": url,
    }
    try:
        with open(meta_p, "w", encoding="utf-8", newline="\n") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
    except OSError:
        pass

    return True, f"Сохранено {len(data)} байт, версия {version} (sha {sha[:16]}…)"


def maybe_fetch_before_analyze() -> tuple[bool, str]:
    """Если в конфиге fetch_on_analyze и enabled — одна попытка загрузки."""
    cfg = read_config()
    if not cfg.get("enabled") or not cfg.get("fetch_on_analyze"):
        return True, ""
    if not (cfg.get("url") or "").strip():
        return True, ""
    ok, msg = fetch_remote_catalog()
    return ok, msg

