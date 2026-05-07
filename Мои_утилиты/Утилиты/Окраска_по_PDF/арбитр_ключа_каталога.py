# -*- coding: utf-8 -*-
"""
Детерминированный выбор ключа CSV по кг/м ведомости (whitelist), затем опционально LLM на ничьях.
Коэффициенты только из каталога; ответ модели — только ключ из переданного списка.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import sys
from typing import Any

_DISAMBIG_CODES = frozenset({"catalog_mass", "implied_kgpm", "area_via_mass"})


def _agent_debug_ndjson(payload: dict[str, Any]) -> None:
    try:
        _hub = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        _ядро = os.path.join(_hub, "Ядро")
        if _ядро not in sys.path:
            sys.path.insert(0, _ядро)
        import отладка  # type: ignore

        отладка.записать_из_утилиты(__file__, payload)
    except Exception:
        pass


def _normalize_asm(s: str | None) -> str:
    return str(s or "").strip().replace("_", "-")


def _row_has_disambiguation_warning(
    validation: list[dict[str, Any]],
    position: str,
    assembly_mark: str,
) -> bool:
    pos = str(position).strip()
    row_mk = _normalize_asm(assembly_mark)
    for v in validation:
        if str(v.get("code") or "") not in _DISAMBIG_CODES:
            continue
        if str(v.get("severity") or "") != "warning":
            continue
        if str(v.get("position", "")).strip() != pos:
            continue
        vm = str(v.get("assembly_mark") or "").strip()
        if vm and _normalize_asm(vm) != row_mk:
            continue
        return True
    return False


def _count_severity(vals: list[dict[str, Any]]) -> tuple[int, int]:
    w = e = 0
    for v in vals:
        s = str(v.get("severity") or "")
        if s == "warning":
            w += 1
        elif s == "error":
            e += 1
    return w, e


def _pick_mass_fit_winner(
    candidates: list[str],
    kgpm_bom: float,
    cat_k: dict[str, float],
    *,
    tolerance_pct: float,
    margin_rel: float = 0.012,
) -> tuple[str | None, str]:
    try:
        from ведомость_металл import within_tolerance
    except ImportError:

        def within_tolerance(a: float, b: float, rel_pct: float, abs_floor: float) -> bool:  # type: ignore[misc]
            d = abs(a - b)
            ref = max(abs(a), abs(b), 1e-9)
            if d <= abs_floor:
                return True
            return (d / ref) <= (rel_pct / 100.0)

    scored: list[tuple[float, str]] = []
    for k in candidates:
        kk = cat_k.get(k)
        if kk is None or float(kk) < 1e-9:
            continue
        kc = float(kk)
        af = max(0.05, 0.02 * abs(float(kgpm_bom)))
        if not within_tolerance(float(kgpm_bom), kc, tolerance_pct, af):
            continue
        rel_err = abs(kc - float(kgpm_bom)) / max(abs(float(kgpm_bom)), abs(kc), 1.0)
        scored.append((rel_err, k))
    scored.sort(key=lambda t: (t[0], t[1]))
    if not scored:
        return None, "no_tol_match"
    best_e, best_k = scored[0]
    if len(scored) < 2:
        return best_k, "single_candidate"
    second_e = scored[1][0]
    if second_e - best_e < margin_rel:
        return None, "tie_margin"
    return best_k, "clear_winner"


def _rank_scores_diag(
    candidates: list[str],
    kgpm_bom: float,
    cat_k: dict[str, float],
    *,
    top: int = 8,
) -> list[dict[str, Any]]:
    """Относительная ошибка кг/м по каждому кандидату (диагностика, без порога допуска)."""
    out: list[dict[str, Any]] = []
    ref = max(abs(float(kgpm_bom)), 1.0)
    for k in candidates:
        kk = cat_k.get(k)
        if kk is None or float(kk) < 1e-9:
            continue
        kc = float(kk)
        rel_err = abs(kc - float(kgpm_bom)) / max(ref, abs(kc), 1.0)
        out.append({"key": k, "rel_err": round(rel_err, 6), "kgpm_catalog": round(kc, 4)})
    out.sort(key=lambda d: (d["rel_err"], str(d["key"])))
    return out[:top]


def _tiebreak_cache_path(util_dir: str) -> str:
    return os.path.join(util_dir, "catalog_key_tiebreak_cache.json")


def resolve_tiebreak_batch_with_llm(
    util_dir: str,
    items: list[dict[str, Any]],
    acfg: dict[str, Any],
) -> dict[str, str]:
    """
    items: {id, profile_raw, candidates: [str], kgpm_bom: float|None}
    Возвращает id -> ключ из candidates или пусто.
    """
    util_dir = str(util_dir or "").strip()
    if not util_dir or not items:
        return {}
    if not bool(acfg.get("catalog_key_disambiguate_llm")):
        return {}
    try:
        from ассистент_llm import post_chat_json
    except ImportError:
        return {}

    out: dict[str, str] = {}
    cache_all: dict[str, Any] = {}
    cpath = _tiebreak_cache_path(util_dir)
    if os.path.isfile(cpath):
        try:
            with open(cpath, encoding="utf-8") as f:
                cache_all = dict(json.load(f))
        except Exception:
            cache_all = {}

    pending: list[dict[str, Any]] = []
    dirty = False

    def _sig(it: dict[str, Any]) -> str:
        cand = sorted(str(x) for x in (it.get("candidates") or []))
        kg = it.get("kgpm_bom")
        try:
            kgr = round(float(kg), 4) if kg is not None else 0.0
        except (TypeError, ValueError):
            kgr = 0.0
        blob = f"{it.get('id')}:{cand}:{kgr}:{it.get('profile_raw') or ''}".encode("utf-8", errors="ignore")
        return hashlib.sha256(blob).hexdigest()[:40]

    for it in items:
        if not isinstance(it, dict):
            continue
        sid = str(it.get("id") or "").strip()
        cands_raw = it.get("candidates") or []
        if not sid or not isinstance(cands_raw, list) or len(cands_raw) < 2:
            continue
        cands = [str(c).strip().lower().replace("х", "x") for c in cands_raw if str(c).strip()]
        if len(cands) < 2:
            continue
        sig = _sig({**it, "candidates": cands})
        hit = cache_all.get(sig)
        if isinstance(hit, str) and hit in cands:
            out[sid] = hit
            continue
        if isinstance(hit, str) and hit == "":
            continue
        pending.append({**it, "candidates": cands, "_sig": sig})

    if not pending:
        return out

    model = str(acfg.get("model_extract") or acfg.get("model") or "gpt-4o-mini")
    to = float(acfg.get("tiebreak_llm_timeout_sec") or 90.0)

    system = """Ты помощник сопоставления профиля КМД с ключом каталога CSV.
Ответ только JSON: {"schema_version":1,"choices":[{"id":"...","key": "один из candidates или null"}]}.
Поле key должно быть ТОЧНО одной строкой из переданного массива candidates для этой же id, либо null.
Запрещено придумывать ключи и числа м²/кг вне списка."""

    user_obj = {"schema_version": 1, "items": pending}
    data, err = post_chat_json(
        util_dir,
        system=system,
        user_content=json.dumps(user_obj, ensure_ascii=False) + "\n\nЗаполни choices[].",
        model=model,
        timeout_sec=min(180.0, to),
        temperature=0.0,
    )
    if not data or err:
        cache_all["_last_tiebreak_llm_error"] = str(err or "empty")
        try:
            with open(cpath, "w", encoding="utf-8") as f:
                json.dump(cache_all, f, ensure_ascii=False, indent=2)
        except OSError:
            pass
        return out

    ch = data.get("choices")
    if not isinstance(ch, list):
        return out

    for row in ch:
        if not isinstance(row, dict):
            continue
        rid = str(row.get("id") or "").strip()
        key = row.get("key")
        it0 = next((p for p in pending if str(p.get("id")) == rid), None)
        if not it0:
            continue
        sig = str(it0.get("_sig") or "")
        cset = set(it0.get("candidates") or [])
        if isinstance(key, str) and key.strip():
            kk = key.strip().lower().replace("х", "x")
            if kk in cset:
                out[rid] = kk
                cache_all[sig] = kk
                dirty = True
            else:
                cache_all[sig] = ""
                dirty = True
        else:
            cache_all[sig] = ""
            dirty = True

    if dirty:
        try:
            with open(cpath, "w", encoding="utf-8") as f:
                json.dump(cache_all, f, ensure_ascii=False, indent=2)
        except OSError:
            pass
    return out


def propagate_same_raw_key_within_mark(
    rows: list[Any],
    changed_indices: set[int],
    catalog_m2: dict[str, float],
    cat_k: dict[str, float] | None,
) -> None:
    """Идём по марке + канонический raw и подставляем самый частый profile_key среди уже разрешённых."""
    try:
        from ведомость_металл import apply_catalog_key_only_to_row, profile_raw_canonical_key
    except ImportError:
        return

    groups: dict[tuple[str, str], list[int]] = {}
    for i, r in enumerate(rows):
        ck = profile_raw_canonical_key(r.profile_raw)
        mk = _normalize_asm(r.assembly_mark)
        if not ck:
            continue
        groups.setdefault((mk, ck), []).append(i)

    for (_mk, _ck), idxs in groups.items():
        if len(idxs) < 2:
            continue
        keys_count: dict[str, int] = {}
        for i in idxs:
            if i not in changed_indices:
                continue
            pk = str(getattr(rows[i], "profile_key", None) or "").strip()
            if pk:
                keys_count[pk] = keys_count.get(pk, 0) + 1
        if not keys_count:
            continue
        best_k = max(keys_count.items(), key=lambda kv: (kv[1], kv[0]))[0]
        best_n = keys_count[best_k]
        if best_n < 2:
            continue
        for i in idxs:
            if getattr(rows[i], "profile_key", None) != best_k:
                apply_catalog_key_only_to_row(rows[i], best_k, catalog_m2, cat_k)


def load_profile_aliases_sidecars(project_json_path: str | None, util_dir: str) -> dict[str, str]:
    """Читает profile_aliases_raw_to_key из JSON проекта и рядом profile_aliases_pending.json."""
    try:
        from ведомость_металл import profile_raw_canonical_key as _prk_side
    except ImportError:

        def _prk_side(x: str) -> str:
            return str(x or "").strip().lower()

    aliases: dict[str, str] = {}
    pj = str(project_json_path or "").strip()
    if pj and os.path.isfile(pj):
        try:
            with open(pj, encoding="utf-8") as f:
                jb = dict(json.load(f))
            blk = jb.get("profile_aliases_raw_to_key") or jb.get("profile_aliases")
            if isinstance(blk, dict):
                for a, b in blk.items():
                    if isinstance(a, str) and isinstance(b, str):
                        aliases[_prk_side(a)] = b.strip()
        except Exception:
            pass
    ud = str(util_dir or "").strip()
    pend = os.path.join(ud, "profile_aliases_pending.json") if ud else ""
    if pend and os.path.isfile(pend):
        try:
            with open(pend, encoding="utf-8") as f:
                jb = dict(json.load(f))
            blk = jb.get("profile_aliases_raw_to_key") or jb.get("entries")
            if isinstance(blk, dict):
                for a, b in blk.items():
                    if isinstance(a, str) and isinstance(b, str):
                        aliases.setdefault(_prk_side(a), b.strip())
        except Exception:
            pass
    return aliases


def run_catalog_key_disambiguation(
    rows: list[Any],
    val_validation: list[dict[str, Any]],
    *,
    catalog_m2: dict[str, float],
    catalog_kg: dict[str, float] | None,
    reconcile_fn: Any,
    validate_fn: Any,
    lint_prefix: list[dict[str, Any]],
    validation_tolerance_pct: float,
    expl_val: float | None,
    expl_found: list[float] | None,
    util_dir: str,
    acfg: dict[str, Any],
    diag_accum: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    После первой validate: пробует переопределить ключ по кг/м, reconcile, заново validate.
    При ухудшении суммарного (warn+error) откатывает rows.
    """
    cat_k = catalog_kg or {}
    diag_accum.setdefault("profile_key_disambiguation", {})
    bucket: dict[str, Any] = diag_accum["profile_key_disambiguation"]
    bucket.setdefault("mass_fit_rows", [])
    bucket.setdefault("llm_rows", [])
    bucket.setdefault("rolled_back", False)
    bucket.setdefault("llm_tiebreak_batch_invoked", False)

    margin_rel_cfg = float(acfg.get("mass_fit_margin_rel") or 0.012)

    enabled = bool(acfg.get("catalog_key_mass_fit_resolve", True))
    if not enabled or not rows or not catalog_m2:
        base = lint_prefix + list(val_validation)
        return base

    try:
        from ведомость_металл import (
            apply_catalog_key_only_to_row,
            bom_kg_per_m_reference,
            collect_catalog_key_candidates,
            profile_raw_canonical_key,
        )
    except ImportError:
        return lint_prefix + list(val_validation)

    before_body = lint_prefix + list(val_validation)
    w0, e0 = _count_severity(before_body)

    rows_backup = copy.deepcopy(rows)
    changed: set[int] = set()

    for i, r in enumerate(rows):
        if not _row_has_disambiguation_warning(val_validation, r.position, r.assembly_mark):
            continue
        kgpm = bom_kg_per_m_reference(r)
        if kgpm is None or kgpm <= 1e-9:
            bucket.setdefault("skipped_no_kgpm", []).append(str(r.position))
            continue
        cands = collect_catalog_key_candidates(r, catalog_m2, cat_k or None, max_keys=12)
        if len(cands) < 2:
            continue
        win, why = _pick_mass_fit_winner(
            cands,
            float(kgpm),
            cat_k,
            tolerance_pct=validation_tolerance_pct,
            margin_rel=margin_rel_cfg,
        )
        if win and apply_catalog_key_only_to_row(r, win, catalog_m2, catalog_kg):
            changed.add(i)
            bucket["mass_fit_rows"].append(
                {
                    "position": r.position,
                    "assembly_mark": r.assembly_mark,
                    "key": win,
                    "reason": why,
                    "chosen_by": "mass_fit",
                    "kgpm_bom": round(float(kgpm), 4),
                    "candidates": list(cands),
                    "rank_scores": _rank_scores_diag(cands, float(kgpm), cat_k),
                }
            )

    _agent_debug_ndjson(
        {
            "runId": "arbiter-propagate",
            "hypothesisId": "H1",
            "location": "арбитр_ключа_каталога.py:before_propagate",
            "message": "before propagate_same_raw_key_within_mark",
            "data": {"cat_k_entries": len(cat_k), "changed_n": len(changed)},
        }
    )
    propagate_same_raw_key_within_mark(rows, changed, catalog_m2, cat_k)
    _agent_debug_ndjson(
        {
            "runId": "arbiter-propagate",
            "hypothesisId": "H1",
            "location": "арбитр_ключа_каталога.py:after_propagate",
            "message": "after propagate_same_raw_key_within_mark",
            "data": {"ok": True},
        }
    )

    reconcile_fn(rows, tolerance_pct=validation_tolerance_pct, abs_kg_tol=0.05)
    va = validate_fn(
        rows,
        tolerance_pct=validation_tolerance_pct,
        explicit_paint_m2=expl_val,
        explicit_candidates=expl_found if expl_found else None,
        catalog_m2_lookup=catalog_m2,
    )
    mid_body = lint_prefix + list(va)
    w1, e1 = _count_severity(mid_body)

    if (w1 + e1) > (w0 + e0):
        rows.clear()
        rows.extend(rows_backup)
        reconcile_fn(rows, tolerance_pct=validation_tolerance_pct, abs_kg_tol=0.05)
        bucket["rolled_back"] = True
        bucket["rollback_reason"] = "mass_fit_worsened_severity"
        return before_body

    if not bool(acfg.get("catalog_key_disambiguate_llm")):
        return mid_body

    val2 = va
    w_best, e_best = w1, e1

    tie_items: list[dict[str, Any]] = []
    seen_gid: set[str] = set()
    for i, r in enumerate(rows):
        if not _row_has_disambiguation_warning(val2, r.position, r.assembly_mark):
            continue
        kgpm = bom_kg_per_m_reference(r)
        if kgpm is None:
            continue
        cands = collect_catalog_key_candidates(r, catalog_m2, cat_k or None, max_keys=12)
        if len(cands) < 2:
            continue
        win, why = _pick_mass_fit_winner(
            cands,
            float(kgpm),
            cat_k,
            tolerance_pct=validation_tolerance_pct,
            margin_rel=margin_rel_cfg,
        )
        if win is None and why == "tie_margin":
            gid = profile_raw_canonical_key(r.profile_raw) + "|" + "|".join(sorted(cands))
            if gid in seen_gid:
                continue
            seen_gid.add(gid)
            tie_items.append(
                {
                    "id": gid[:120],
                    "profile_raw": (r.profile_raw or "")[:200],
                    "candidates": cands[:6],
                    "kgpm_bom": round(float(kgpm), 4),
                }
            )

    if not tie_items:
        return mid_body

    lim = max(1, min(int(acfg.get("tiebreak_llm_max_groups") or 24), 40))
    llm_map = resolve_tiebreak_batch_with_llm(util_dir, tie_items[:lim], acfg)
    bucket["llm_tiebreak_batch_invoked"] = bool(tie_items[:lim])

    rows_mass_snapshot = copy.deepcopy(rows)
    llm_changed_count = 0

    for _i, r in enumerate(rows):
        if not _row_has_disambiguation_warning(val2, r.position, r.assembly_mark):
            continue
        kgpm = bom_kg_per_m_reference(r)
        if kgpm is None:
            continue
        cands = collect_catalog_key_candidates(r, catalog_m2, cat_k or None, max_keys=12)
        if len(cands) < 2:
            continue
        win, why = _pick_mass_fit_winner(
            cands,
            float(kgpm),
            cat_k,
            tolerance_pct=validation_tolerance_pct,
            margin_rel=margin_rel_cfg,
        )
        if win is not None or why != "tie_margin":
            continue
        gid = profile_raw_canonical_key(r.profile_raw) + "|" + "|".join(sorted(cands))
        gid_short = gid[:120]
        key_llm = llm_map.get(gid_short) or llm_map.get(gid)
        if isinstance(key_llm, str) and key_llm and apply_catalog_key_only_to_row(r, key_llm, catalog_m2, catalog_kg):
            llm_changed_count += 1
            bucket["llm_rows"].append(
                {
                    "position": r.position,
                    "assembly_mark": r.assembly_mark,
                    "key": key_llm,
                    "chosen_by": "llm",
                    "kgpm_bom": round(float(kgpm), 4),
                    "candidates": list(cands),
                    "rank_scores": _rank_scores_diag(cands, float(kgpm), cat_k),
                }
            )

    if llm_changed_count == 0:
        return mid_body

    reconcile_fn(rows, tolerance_pct=validation_tolerance_pct, abs_kg_tol=0.05)
    va3 = validate_fn(
        rows,
        tolerance_pct=validation_tolerance_pct,
        explicit_paint_m2=expl_val,
        explicit_candidates=expl_found if expl_found else None,
        catalog_m2_lookup=catalog_m2,
    )
    tail = lint_prefix + list(va3)
    w3, e3 = _count_severity(tail)
    if (w3 + e3) > (w_best + e_best):
        rows.clear()
        rows.extend(copy.deepcopy(rows_mass_snapshot))
        reconcile_fn(rows, tolerance_pct=validation_tolerance_pct, abs_kg_tol=0.05)
        bucket["llm_rolled_back"] = True
        return mid_body

    bucket["llm_attempted_groups"] = len(tie_items[:lim])
    return tail


if __name__ == "__main__":
    _ck2 = {"k1": 100.0, "k2": 101.5}
    _w, _wy = _pick_mass_fit_winner(
        ["k1", "k2"],
        100.1,
        _ck2,
        tolerance_pct=5.0,
        margin_rel=0.01,
    )
    assert _w == "k1" and _wy == "clear_winner"
    _rs = _rank_scores_diag(["k1", "k2"], 100.1, _ck2)
    assert _rs[0]["key"] == "k1"
    print("арбитр_ключа_каталога: ok")
