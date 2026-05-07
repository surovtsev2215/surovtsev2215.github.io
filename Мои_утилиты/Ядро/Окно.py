# -*- coding: utf-8 -*-
"""
Главное окно хаба: общий холст с фоном, центральное игровое меню и матовая карточка с утилитой.
Горячие клавиши, фоновое сканирование, автосохранение, восстановление геометрии.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import threading
import time
import tkinter as tk
import tkinter.font as tkfont
from tkinter import messagebox as tk_msg
from collections.abc import Callable

# Ядро лежит в той же папке, что и этот файл
_ЯДРО = os.path.dirname(os.path.abspath(__file__))
_КОРЕНЬ = os.path.dirname(_ЯДРО)
if _ЯДРО not in sys.path:
    sys.path.insert(0, _ЯДРО)

_AGENT_DEBUG_LOG = os.path.normpath(os.path.join(_КОРЕНЬ, "..", "debug-b66d0a.log"))


def _agent_debug_ndjson(hypothesis_id: str, location: str, message: str, data: dict | None = None) -> None:
    #region agent log
    try:
        payload = {
            "sessionId": "b66d0a",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(time.time() * 1000),
        }
        with open(_AGENT_DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
    #endregion


import Бэкап  # type: ignore
import Журнал  # type: ignore
import Сканер  # type: ignore
import Фон  # type: ignore
import hub_theme  # type: ignore
import отладка  # type: ignore


def _настройки_путь(корень: str) -> str:
    return os.path.join(корень, "Настройки.json")


def _загрузить_настройки(корень: str) -> dict:
    п = _настройки_путь(корень)
    if not os.path.isfile(п):
        return {}
    try:
        with open(п, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _сохранить_настройки(корень: str, data: dict) -> None:
    try:
        п = _настройки_путь(корень)
        tmp = п + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, п)
    except Exception:
        pass


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    hc = hex_color.strip().lstrip("#")
    return (int(hc[0:2], 16), int(hc[2:4], 16), int(hc[4:6], 16))


def _mix_hex(a: str, b: str, t: float) -> str:
    t = max(0.0, min(1.0, t))
    ar, ag, ab = _hex_to_rgb(a)
    br, bg, bb = _hex_to_rgb(b)
    r = int(round(ar + (br - ar) * t))
    g = int(round(ag + (bg - ag) * t))
    b_ = int(round(ab + (bb - ab) * t))
    return f"#{r:02x}{g:02x}{b_:02x}"


def _цвет_оверлея_игрового_меню() -> str:
    """Смесь фона карточки и более светлого тона — имитация лёгкой прозрачности (Tk без альфы у Frame)."""
    blend = float(getattr(hub_theme, "GAME_MENU_OVERLAY_BLEND", 0.34))
    toward = str(getattr(hub_theme, "GAME_MENU_OVERLAY_WITH", hub_theme.SURFACE_SOFT_MID))
    return _mix_hex(hub_theme.CARD_ALT, toward, blend)


def _цвет_стекла_игрового_меню(base: str) -> str:
    """Едва заметное осветление панелей поверх обоев — визуально «просвечивает» фон (без настоящей альфы)."""
    toward = str(getattr(hub_theme, "GAME_MENU_GLASS_TINT", "#5c6a80"))
    t = float(getattr(hub_theme, "GAME_MENU_GLASS_STRENGTH", 0.14))
    return _mix_hex(base, toward, max(0.0, min(0.22, t)))


def _герой_wallpaper_vignette_mul(size: tuple[int, int], strength: float) -> object | None:
    """Мультипликативная виньетка (центр ярче, края темнее); RGB для ImageChops.multiply."""
    tw, th = size
    if strength <= 0:
        return None
    mw, mh = max(64, tw // 6), max(64, th // 6)
    cx, cy = (mw - 1) / 2.0, (mh - 1) / 2.0
    rmax_sq = cx * cx + cy * cy + 1e-6
    floor = max(0.0, 1.0 - strength)
    span = max(1e-6, 1.0 - floor)
    from PIL import Image

    pix: list[int] = []
    for y in range(mh):
        dy = y - cy
        for x in range(mw):
            dx = x - cx
            t = min(1.0, (dx * dx + dy * dy) / rmax_sq)
            mul_f = floor + span * (1.0 - t * t)
            pix.append(max(1, min(255, int(255 * mul_f))))
    lm = Image.new("L", (mw, mh))
    lm.putdata(pix)
    big = lm.resize((tw, th), Image.Resampling.LANCZOS)
    return Image.merge("RGB", (big, big, big))


def _собрать_обои_pil(
    path: str,
    w: int,
    h: int,
    *,
    film_hex: str,
    film_alpha: float,
    blur_radius_px: float,
    vignette_strength: float,
    source_max_side: int,
) -> object | None:
    """RGB (w×h): cover через ImageOps.fit, затем blur / плёнка / виньетка. None при ошибке или без Pillow."""
    try:
        from PIL import Image, ImageChops, ImageFilter, ImageOps
    except ImportError:
        return None
    if not path or w < 24 or h < 24:
        return None
    try:
        if not os.path.isfile(path):
            return None
        im = Image.open(path)
        m = getattr(im, "mode", "") or ""
        im.seek(0)
        if m not in {"RGB", "RGBA", "P", "PA", "L", "LA", "CMYK"}:
            im = im.convert("RGBA")
        elif m == "CMYK":
            im = im.convert("RGB").convert("RGBA")
        elif m != "RGBA":
            im = im.convert("RGBA")

        mx = int(source_max_side or 0)
        if mx > 0:
            im.thumbnail((mx, mx), Image.Resampling.LANCZOS)

        fitted = ImageOps.fit(im, (w, h), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        base = fitted.convert("RGB")

        blur_r = float(blur_radius_px or 0.0)
        if blur_r > 0:
            base = base.filter(ImageFilter.GaussianBlur(radius=blur_r))

        alpha_f = max(0.0, min(1.0, float(film_alpha or 0.0)))
        if alpha_f > 0:
            solid_rgb = Image.new("RGB", (w, h), _hex_to_rgb(str(film_hex)))
            base = Image.blend(base, solid_rgb, alpha_f)

        vig = float(vignette_strength or 0.0)
        if vig > 0:
            vm = _герой_wallpaper_vignette_mul((w, h), vig)
            if vm is not None:
                base = ImageChops.multiply(base, vm)
        return base
    except Exception:
        return None


def _собрать_герой_обои_pil(path: str, w: int, h: int) -> object | None:
    """Обои рабочей зоны — параметры из hub_theme (герой)."""
    return _собрать_обои_pil(
        path,
        w,
        h,
        film_hex=str(getattr(hub_theme, "WALLPAPER_FILM_HEX", hub_theme.SIDEBAR_BG)),
        film_alpha=float(getattr(hub_theme, "WALLPAPER_FILM_ALPHA", 0.42) or 0.0),
        blur_radius_px=float(getattr(hub_theme, "WALLPAPER_BLUR_RADIUS_PX", 0.0) or 0.0),
        vignette_strength=float(getattr(hub_theme, "WALLPAPER_VIGNETTE_STRENGTH", 0.0) or 0.0),
        source_max_side=int(getattr(hub_theme, "WALLPAPER_SOURCE_MAX_SIDE", 2560) or 2560),
    )


def _наложить_скрим_списка_сайдбара(base: object, sw: int, sh: int) -> object:
    """Затемняет прямоугольник под непрозрачным Listbox (цвет SIDEBAR_LIST_INSET)."""
    try:
        rect = getattr(hub_theme, "SIDEBAR_LIST_SCRIM_RECT", None)
        alpha = float(getattr(hub_theme, "SIDEBAR_LIST_SCRIM_ALPHA", 0.0) or 0.0)
        if not rect or len(rect) != 4 or alpha <= 0:
            return base
        from PIL import Image

        x0 = max(0, min(sw - 1, int(float(rect[0]) * sw)))
        y0 = max(0, min(sh - 1, int(float(rect[1]) * sh)))
        x1 = max(x0 + 1, min(sw, int(float(rect[2]) * sw)))
        y1 = max(y0 + 1, min(sh, int(float(rect[3]) * sh)))
        inset_hex = str(getattr(hub_theme, "SIDEBAR_LIST_INSET", hub_theme.SIDEBAR_BG))
        overlay = Image.new("RGB", (x1 - x0, y1 - y0), _hex_to_rgb(inset_hex))
        region = base.crop((x0, y0, x1, y1))
        blended = Image.blend(region, overlay, max(0.0, min(1.0, alpha)))
        out = base.copy()
        out.paste(blended, (x0, y0))
        return out
    except Exception:
        return base


def _собрать_обои_сайдбара_pil(path: str, sw: int, sh: int) -> object | None:
    """Полная ширина/высота левой панели + скрим под список."""
    base = _собрать_обои_pil(
        path,
        sw,
        sh,
        film_hex=str(getattr(hub_theme, "SIDEBAR_WALLPAPER_FILM_HEX", hub_theme.SIDEBAR_BG)),
        film_alpha=float(getattr(hub_theme, "SIDEBAR_WALLPAPER_FILM_ALPHA", 0.52) or 0.0),
        blur_radius_px=float(getattr(hub_theme, "SIDEBAR_WALLPAPER_BLUR_RADIUS_PX", 0.0) or 0.0),
        vignette_strength=float(getattr(hub_theme, "SIDEBAR_WALLPAPER_VIGNETTE_STRENGTH", 0.0) or 0.0),
        source_max_side=int(getattr(hub_theme, "SIDEBAR_WALLPAPER_SOURCE_MAX_SIDE", 2560) or 2560),
    )
    if base is None:
        return None
    return _наложить_скрим_списка_сайдбара(base, sw, sh)


class ХабУтилит(tk.Tk):
    def __init__(self, корень_хаба: str):
        super().__init__()
        self._корень = корень_хаба
        self.title("Golden Section")
        self.minsize(680, 460)
        try:
            _ico = os.path.join(self._корень, "ПТО.ico")
            if os.path.isfile(_ico):
                self.iconbitmap(_ico)
        except Exception:
            pass

        self._журнал = lambda m, lvl="INFO": Журнал.записать(self._корень, m, lvl)
        self._журнал("Запуск хаба утилит", "INFO")

        self._настройки = _загрузить_настройки(self._корень)
        self._инициализировать_настройки_по_умолчанию()

        # Ежедневный бэкап
        _t_bu = time.time()
        отладка.записать({"hypothesisId": "H2", "location": "Окно.__init__", "message": "backup_section_enter", "runId": "startup"})
        try:
            last = self._настройки.get("last_backup_date")
            if Бэкап.нужен_бэкап_сегодня(self._корень, last):

                def _обновить_дату():
                    from datetime import date

                    self._настройки["last_backup_date"] = date.today().isoformat()
                    _сохранить_настройки(self._корень, self._настройки)

                Бэкап.выполнить_если_нужно(
                    self._корень,
                    self._журнал,
                    _обновить_дату,
                )
        except Exception as e:
            self._журнал(f"Бэкап пропущен из-за ошибки: {e}", "WARN")
        отладка.записать(
            {
                "hypothesisId": "H2",
                "location": "Окно.__init__",
                "message": "backup_section_exit",
                "runId": "startup",
                "data": {"elapsed_ms": int((time.time() - _t_bu) * 1000)},
            }
        )

        geo = self._настройки.get("geometry")
        if geo:
            try:
                self.geometry(geo)
            except Exception:
                pass
        # Сразу разворачиваем на весь экран (поверх сохранённой геометрии — для корректной инициализации).
        self.after_idle(self._развернуть_окно_на_весь_экран)

        # Палитра из hub_theme
        self._цвет_корня = hub_theme.SIDEBAR_BG
        self._цвет_меню_фон = hub_theme.SIDEBAR_ELEVATED
        self._цвет_меню_акцент = hub_theme.ACCENT
        self._цвет_карточки = hub_theme.CARD_ALT
        self._цвет_оверлей_меню = _цвет_оверлея_игрового_меню()
        self._цвет_стекла_меню = _цвет_стекла_игрового_меню(self._цвет_оверлей_меню)
        self._game_menu_mode: str = "main"  # main | utils
        self._game_util_buttons: dict[str, tk.Frame] = {}
        self._game_utils_list_fr: tk.Frame | None = None
        self._bg_photo_refs: list[tk.PhotoImage] = []
        self._bg_job = None  # id after() для отложенной отрисовки фона
        self._bg_path: str | None = None
        self._workspace_canvas: tk.Canvas | None = None  # задаётся в разметке
        self._workspace_full_pil: object | None = None  # RGB PIL после сборки WxH для crop карточки
        self._card_win: int | None = None
        self._card_shadow_rect: int | None = None
        self._card_bg_label: tk.Label | None = None
        self._card_gloss_refs: list[tk.PhotoImage] = []
        self._menu_overlay_wallpaper_label: tk.Label | None = None
        self._menu_overlay_photo_refs: list[tk.PhotoImage] = []
        self._game_menu_logo_photo: tk.PhotoImage | None = None
        self._menu_transition_after: str | None = None
        self._menu_anim_running: bool = False
        self._pending_menu_transition: Callable[[], None] | None = None
        self._slide_in_from_empty_overlay: bool = False  # см. прежнее ожидание хвоста slide_in после холодного открытия

        self.configure(bg=self._цвет_корня)

        # Фон: кэш сразу (без сети на главном потоке); недостающее — качать в daemon-потоке (иначе белый экран на минуты)
        отладка.записать({"hypothesisId": "H1", "location": "Окно.__init__", "message": "bg_cache_check_start", "runId": "startup"})
        if getattr(hub_theme, "HUB_USE_PHOTO_WALLPAPER", True):
            self._bg_path = Фон.локальный_кэш_если_готов(self._корень)
        else:
            self._bg_path = None
        отладка.записать(
            {
                "hypothesisId": "H1",
                "location": "Окно.__init__",
                "message": "bg_cache_check_done",
                "runId": "startup",
                "data": {
                    "has_local_png": bool(self._bg_path),
                    "photo_wallpaper": bool(getattr(hub_theme, "HUB_USE_PHOTO_WALLPAPER", True)),
                },
            }
        )

        _рабочая = tk.Frame(self, bg=self._цвет_корня)
        self._workspace_canvas = tk.Canvas(_рабочая, highlightthickness=0, bd=0, bg=self._цвет_корня)
        self._workspace_canvas.pack(fill=tk.BOTH, expand=True)

        self._card = tk.Frame(
            self._workspace_canvas,
            bg=self._цвет_карточки,
            highlightthickness=0,
            highlightbackground=hub_theme.CANVAS_BOTTOM,
        )
        self._card.columnconfigure(0, weight=1)
        self._card.rowconfigure(0, weight=1)
        self._card_bg_label = tk.Label(self._card, borderwidth=0, highlightthickness=0)
        self._card_bg_label.grid(row=0, column=0, sticky="nsew")
        hx, hy = hub_theme.PAD_HUB_CARD
        self._content_outer = tk.Frame(self._card, bg=self._цвет_карточки)
        self._content_outer.grid(row=0, column=0, sticky="nsew", padx=hx, pady=hy)
        try:
            self._content_outer.lift(self._card_bg_label)
        except Exception:
            pass

        self._hub_bar = tk.Frame(self._content_outer, bg=self._цвет_карточки, height=38)
        self._hub_bar.pack(fill=tk.X, side=tk.TOP)
        self._hub_bar.pack_propagate(False)
        self._hub_menu_btn = tk.Label(
            self._hub_bar,
            text="☰  Меню",
            font=hub_theme.FONT_MD,
            bg=self._цвет_карточки,
            fg=hub_theme.ACCENT,
            cursor="hand2",
            padx=4,
            pady=6,
        )
        self._hub_menu_btn.pack(side=tk.LEFT, padx=(4, 8))
        self._hub_menu_btn.bind("<Button-1>", lambda _e: self._показать_главное_игровое_меню())
        self._hub_menu_btn.bind("<Enter>", lambda _e: self._hub_menu_btn.configure(fg=hub_theme.ACCENT_HOVER))
        self._hub_menu_btn.bind("<Leave>", lambda _e: self._hub_menu_btn.configure(fg=hub_theme.ACCENT))

        self._tabs_host = tk.Frame(self._content_outer, bg=self._цвет_карточки)
        self._tabs_host.pack(fill=tk.BOTH, expand=True)

        self._menu_overlay = tk.Frame(self._card, bg=self._цвет_карточки, highlightthickness=0)
        self._menu_overlay.grid(row=0, column=0, sticky="nsew", padx=hx, pady=hy)
        self._menu_overlay.columnconfigure(0, weight=1)
        self._menu_overlay.rowconfigure(0, weight=1)
        self._menu_overlay_wallpaper_label = tk.Label(self._menu_overlay, borderwidth=0, highlightthickness=0)
        self._menu_overlay_wallpaper_label.grid(row=0, column=0, sticky="nsew")
        self._game_menu_center = tk.Frame(self._menu_overlay, bg=self._цвет_стекла_меню)
        _rely0 = float(getattr(hub_theme, "GAME_MENU_RELY_CENTER", 0.50) or 0.50)
        self._game_menu_center.place(relx=0.5, rely=_rely0, anchor=tk.CENTER)
        try:
            self._game_menu_center.lift(self._menu_overlay_wallpaper_label)
        except Exception:
            pass
        self._поднять_оверлей_меню_над_контентом()

        self._card_win = self._workspace_canvas.create_window(0, 0, window=self._card, anchor=tk.NW)
        self._workspace_canvas.bind("<Configure>", self._on_workspace_configure)

        self.after_idle(self._перерисовать_фон_и_карточку)
        self.after(300, self._перерисовать_фон_и_карточку)

        _рабочая.pack(fill=tk.BOTH, expand=True)

        # Состояние вкладок: порядок ключей; виджеты вкладок
        self._keys_order: list[str] = []
        self._tabs: dict[str, dict] = {}  # key -> meta
        self._модули: dict[str, object] = {}
        self._текущий_ключ: str | None = None
        self._last_closed: str | None = self._настройки.get("last_closed_key")

        _agent_debug_ndjson("H2", "Окно.__init__", "before_build_tabs", {})
        self._построить_вкладки_из_настроек_и_скана()
        _agent_debug_ndjson("H2", "Окно.__init__", "after_build_tabs", {})

        self._привязать_горячие_клавиши()

        self._schedule_scan()
        self._schedule_autosave()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        if self._bg_path is None and getattr(hub_theme, "HUB_USE_PHOTO_WALLPAPER", True):
            отладка.записать({"hypothesisId": "H1", "location": "Окно.__init__", "message": "bg_thread_spawn", "runId": "startup"})
            threading.Thread(target=self._фон_скачать_фоновым_потоком, daemon=True).start()
        отладка.записать({"hypothesisId": "H5", "location": "Окно.__init__", "message": "init_complete", "runId": "startup"})

    def _фон_скачать_фоновым_потоком(self) -> None:
        _t0 = time.time()
        отладка.записать({"hypothesisId": "H1", "location": "_фон_скачать_фоновым_потоком", "message": "worker_start"})
        p: str | None = None
        try:
            p = Фон.обеспечить_фоновый_файл(self._корень, self._журнал)
        except Exception:
            p = None
        _ms = int((time.time() - _t0) * 1000)
        отладка.записать(
            {
                "hypothesisId": "H1",
                "location": "_фон_скачать_фоновым_потоком",
                "message": "worker_done",
                "data": {"elapsed_ms": _ms, "got_path": bool(p)},
            }
        )
        self.after(0, lambda p=p: self._применить_путь_фона_после_потока(p))

    def _применить_путь_фона_после_потока(self, p: str | None) -> None:
        try:
            if not self.winfo_exists():
                return
        except tk.TclError:
            return
        if not getattr(hub_theme, "HUB_USE_PHOTO_WALLPAPER", True):
            return
        ok = bool(p and os.path.isfile(p))
        отладка.записать(
            {"hypothesisId": "H1", "location": "_применить_путь_фона_после_потока", "message": "ui_apply", "data": {"accepted": ok}}
        )
        if not ok:
            return
        self._bg_path = p
        self._перерисовать_фон_и_карточку()

    def _развернуть_окно_на_весь_экран(self) -> None:
        """Максимизация главного окна (Windows: state zoomed; иначе — атрибут -zoomed)."""
        try:
            if not self.winfo_viewable():
                self.after(50, self._развернуть_окно_на_весь_экран)
                return
        except tk.TclError:
            pass
        try:
            if sys.platform == "win32":
                self.state("zoomed")
            elif sys.platform == "darwin":
                try:
                    self.state("zoomed")
                except tk.TclError:
                    try:
                        self.attributes("-zoomed", True)
                    except tk.TclError:
                        pass
            else:
                try:
                    self.attributes("-zoomed", True)
                except tk.TclError:
                    try:
                        self.state("zoomed")
                    except tk.TclError:
                        pass
        except tk.TclError:
            pass

    def _ширина_сайдбара_пикс(self) -> int:
        """Левой панели нет — вся ширина под карточку."""
        return 0

    def _tkfont_cached(self, font_spec: object) -> tkfont.Font:
        """Один Font на спецификацию — избегаем лишних аллокаций при списке утилит."""
        c = getattr(self, "_hub_tkfont_by_spec", None)
        if c is None:
            c = {}
            self._hub_tkfont_by_spec = c
        f = c.get(font_spec)
        if f is None:
            f = tkfont.Font(self, font=font_spec)
            c[font_spec] = f
        return f

    def _ширина_колонки_игровых_кнопок_px(self, подписи: list[str], *, large: bool = False) -> int:
        """Одинаковая ширина кнопок в списке утилит."""
        if not подписи:
            return 300
        if large:
            font_spec = getattr(hub_theme, "FONT_GAME_MENU_CTA", (hub_theme.FF, 16, "bold"))
            pad_x = 56
            slack = 14
        else:
            font_spec = (hub_theme.FF, 13, "bold")
            pad_x = 28
            slack = 12
        f = self._tkfont_cached(font_spec)
        return max(int(f.measure(s)) for s in подписи) + pad_x * 2 + slack

    def _ширина_cta_главного_меню_px(self, подписи: list[str]) -> int:
        """Одинаковая ширина оранжевых кнопок на корневом экране меню («Выполнение» / «Утилиты»)."""
        if not подписи:
            return 340
        font_spec = getattr(hub_theme, "FONT_GAME_MENU_CTA", (hub_theme.FF, 16, "bold"))
        px = 56
        slack = 32
        f = self._tkfont_cached(font_spec)
        m = max(int(f.measure(s)) for s in подписи) + px * 2 + slack
        return max(318, min(540, int(m)))

    def _игровая_кнопка_меню(
        self,
        parent: tk.Misc,
        text: str,
        command: Callable[[], None],
        *,
        large: bool = False,
        err: bool = False,
        utility_row: bool = False,
        fixed_width_px: int | None = None,
    ) -> tk.Frame:
        if large and not err:
            bg0 = str(getattr(hub_theme, "GAME_MENU_PRIMARY_BG", hub_theme.ACCENT))
            fg0 = str(getattr(hub_theme, "GAME_MENU_PRIMARY_FG", hub_theme.ACCENT_FG))
            border = str(getattr(hub_theme, "GAME_MENU_PRIMARY_BORDER", hub_theme.ACCENT_DIM))
            bg_h = str(getattr(hub_theme, "GAME_MENU_PRIMARY_BG_HOVER", hub_theme.ACCENT_HOVER))
            fg_h = str(getattr(hub_theme, "GAME_MENU_PRIMARY_FG", hub_theme.ACCENT_FG))
            hi_on_hover = str(getattr(hub_theme, "GAME_MENU_PRIMARY_BORDER_HOVER", hub_theme.ACCENT_HOVER))
            font = getattr(hub_theme, "FONT_GAME_MENU_CTA", (hub_theme.FF, 16, "bold"))
            py = 20
            px = 56
            hi_thick = 1
        else:
            hi_thick = 1 if utility_row else 2
            if utility_row and not err:
                bg0 = str(getattr(hub_theme, "GAME_MENU_LIST_BTN_BG", hub_theme.GAME_MENU_BUTTON_BG))
                border = str(getattr(hub_theme, "GAME_MENU_LIST_BTN_BORDER", hub_theme.BORDER_STRONG))
                bg_h = str(getattr(hub_theme, "GAME_MENU_LIST_BTN_BG_HOVER", hub_theme.GAME_MENU_BUTTON_BG_HOVER))
                hi_on_hover = str(
                    getattr(hub_theme, "GAME_MENU_LIST_BTN_BORDER_HOVER", hub_theme.ACCENT),
                )
            else:
                bg0 = str(getattr(hub_theme, "GAME_MENU_BUTTON_BG", hub_theme.SIDEBAR_SURFACE))
                border = hub_theme.ERROR_FG if err else hub_theme.BORDER_STRONG
                bg_h = str(getattr(hub_theme, "GAME_MENU_BUTTON_BG_HOVER", hub_theme.SIDEBAR_SELECT_BG))
                hi_on_hover = hub_theme.ACCENT
            fg0 = hub_theme.ERROR_FG if err else hub_theme.SIDEBAR_TEXT
            fg_h = hub_theme.ERROR_FG if err else (
                hub_theme.SIDEBAR_TEXT if utility_row else hub_theme.SIDEBAR_SELECT_FG
            )
            font = (hub_theme.FF, 17, "bold") if large else (hub_theme.FF, 13, "bold")
            py = 20 if large else 12
            px = 44 if large else 28

        wrap = tk.Frame(parent, bg=bg0, highlightthickness=hi_thick, highlightbackground=border)
        center_cta = bool(large and not err and fixed_width_px)
        lbl = tk.Label(
            wrap,
            text=text,
            font=font,
            bg=bg0,
            fg=fg0,
            cursor="hand2",
            padx=px,
            pady=py,
            anchor=tk.CENTER if center_cta else tk.W,
            justify=tk.CENTER if center_cta else tk.LEFT,
        )
        lbl.pack(fill=tk.X, expand=True)
        if fixed_width_px is not None and fixed_width_px > 0:
            wrap.configure(width=int(fixed_width_px))
            fm = self._tkfont_cached(font)
            need_h = max(28, int(fm.metrics("linespace")) + py * 2 + int(hi_thick) * 2)
            wrap.configure(height=need_h)
            wrap.pack_propagate(False)

        def _go(_e=None) -> None:
            command()

        def _on_enter(_e=None) -> None:
            wrap.configure(bg=bg_h, highlightbackground=hi_on_hover)
            lbl.configure(bg=bg_h, fg=fg_h)

        def _on_leave(_e=None) -> None:
            wrap.configure(bg=bg0, highlightbackground=border)
            lbl.configure(bg=bg0, fg=fg0)

        for w in (wrap, lbl):
            w.bind("<Button-1>", _go)
            w.bind("<Enter>", _on_enter)
            w.bind("<Leave>", _on_leave)
        return wrap

    def _игровая_строка_меню_с_описанием(
        self,
        parent: tk.Misc,
        text: str,
        command: Callable[[], None],
        *,
        описание: str,
        large: bool = False,
        err: bool = False,
        ширина_колонки_кнопки: int | None = None,
        utility_row: bool = False,
        в_карточке: bool = False,
    ) -> tk.Frame:
        """Кнопка и описание; при ширине колонки — выравнивание сеткой, карточка для строк утилит."""
        glass = self._цвет_стекла_меню
        card_bg = str(getattr(hub_theme, "GAME_MENU_LIST_CARD_BG", glass))
        row_bg = card_bg if в_карточке else glass
        outer = tk.Frame(parent, bg=glass, highlightthickness=0)

        host = tk.Frame(outer, bg=row_bg, highlightthickness=0)
        if в_карточке:
            host.pack(fill=tk.X, pady=(0, 10), padx=2)
            inner = tk.Frame(host, bg=row_bg, highlightthickness=0)
            inner.pack(fill=tk.X, padx=14, pady=12)
        else:
            host.pack(fill=tk.X)
            inner = host

        if ширина_колонки_кнопки is None:
            btn = self._игровая_кнопка_меню(
                inner,
                text,
                command,
                large=large,
                err=err,
                utility_row=utility_row,
            )
            btn.pack(side=tk.LEFT, anchor=tk.N)
            if описание:
                desc_fg = str(
                    getattr(hub_theme, "GAME_MENU_LIST_DESC_FG", hub_theme.GAME_MENU_KICKER_FG),
                )
                wlen = int(getattr(hub_theme, "GAME_MENU_LIST_WRAPLENGTH", 400) or 400)
                tk.Label(
                    inner,
                    text=описание,
                    font=getattr(hub_theme, "FONT_GAME_MENU_LIST_DESC", hub_theme.FONT_SM),
                    bg=row_bg,
                    fg=desc_fg,
                    justify=tk.LEFT,
                    anchor=tk.W,
                    wraplength=wlen,
                ).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(16, 8), pady=(4, 0))
            return outer

        row = tk.Frame(inner, bg=row_bg, highlightthickness=0)
        row.pack(fill=tk.X)
        bw = int(ширина_колонки_кнопки)
        row.columnconfigure(0, minsize=bw, weight=0)
        row.columnconfigure(1, weight=1)

        btn_cell = tk.Frame(row, bg=row_bg, highlightthickness=0)
        btn_cell.grid(row=0, column=0, sticky="ns", padx=(0, 18), pady=(6, 6))
        v_top = tk.Frame(btn_cell, bg=row_bg, highlightthickness=0)
        v_top.pack(side=tk.TOP, expand=True, fill=tk.BOTH)
        btn_host = tk.Frame(btn_cell, bg=row_bg, highlightthickness=0)
        btn_host.pack(side=tk.TOP, fill=tk.X)
        v_bot = tk.Frame(btn_cell, bg=row_bg, highlightthickness=0)
        v_bot.pack(side=tk.TOP, expand=True, fill=tk.BOTH)

        btn = self._игровая_кнопка_меню(
            btn_host,
            text,
            command,
            large=large,
            err=err,
            utility_row=utility_row,
            fixed_width_px=bw,
        )
        btn.pack(fill=tk.X)

        if описание:
            desc_fg = str(getattr(hub_theme, "GAME_MENU_LIST_DESC_FG", hub_theme.GAME_MENU_KICKER_FG))
            wlen = int(getattr(hub_theme, "GAME_MENU_LIST_WRAPLENGTH", 480) or 480)
            desc_cell = tk.Frame(row, bg=row_bg, highlightthickness=0)
            desc_cell.grid(row=0, column=1, sticky="nsew", pady=(6, 6))
            d_top = tk.Frame(desc_cell, bg=row_bg, highlightthickness=0)
            d_top.pack(side=tk.TOP, expand=True, fill=tk.BOTH)
            tk.Label(
                desc_cell,
                text=описание,
                font=getattr(hub_theme, "FONT_GAME_MENU_LIST_DESC", hub_theme.FONT_SM),
                bg=row_bg,
                fg=desc_fg,
                justify=tk.LEFT,
                anchor=tk.W,
                wraplength=wlen,
            ).pack(side=tk.TOP, anchor=tk.W)
            d_bot = tk.Frame(desc_cell, bg=row_bg, highlightthickness=0)
            d_bot.pack(side=tk.TOP, expand=True, fill=tk.BOTH)
        return outer

    def _поднять_оверлей_меню_над_контентом(self) -> None:
        """Оверлей должен быть выше матовой подложки и рабочей области (_content_outer), иначе меню не видно."""
        mo = getattr(self, "_menu_overlay", None)
        co = getattr(self, "_content_outer", None)
        if mo is None:
            return
        try:
            if co is not None:
                mo.lift(co)
            else:
                mo.tkraise()
        except Exception:
            try:
                mo.tkraise()
            except Exception:
                pass

    def _очистить_центр_игрового_меню(self) -> None:
        try:
            for ch in self._game_menu_center.winfo_children():
                ch.destroy()
        except tk.TclError:
            pass

    def _отменить_анимацию_меню(self) -> None:
        jid = getattr(self, "_menu_transition_after", None)
        if jid is not None:
            try:
                self.after_cancel(jid)
            except Exception:
                pass
            self._menu_transition_after = None

    def _game_menu_rely_base(self) -> float:
        return float(getattr(hub_theme, "GAME_MENU_RELY_CENTER", 0.50) or 0.50)

    def _game_menu_rely_slide_dest(self) -> float:
        base = self._game_menu_rely_base()
        d = max(0.0, float(getattr(hub_theme, "GAME_MENU_RELY_SLIDE", 0.048) or 0.0))
        return min(0.95, base + d)

    @staticmethod
    def _ease_меню_сегмент(t: float, kind: str) -> float:
        """Сглаживание прогресса 0..1: квинтика мягче кубической; in_out — для единого «ритма» входа/выхода."""
        t = max(0.0, min(1.0, t))
        if kind == "in_out":
            if t < 0.5:
                return 16.0 * t * t * t * t * t
            p = -2.0 * t + 2.0
            return 1.0 - (p**5) / 2.0
        if kind == "in":
            return t * t * t * t * t
        # "out"
        return 1.0 - (1.0 - t) ** 5

    def _меню_slide_in_finished(self) -> None:
        """После любого slide_in: снимаем флаг «вход с пустого центра» и отпускаем очередь."""
        self._slide_in_from_empty_overlay = False
        self._меню_анимация_завершена()

    def _меню_анимация_завершена(self) -> None:
        """Снимает блокировку очереди; после одного перехода подхватывает отложенный build_fn без отмены текущего слайда."""
        self._menu_anim_running = False
        pending = self._pending_menu_transition
        self._pending_menu_transition = None
        if pending:
            self._меню_анимировать_переход(pending)

    def _ease_для_фазы_меню(self, phase: str) -> str:
        mode = str(getattr(hub_theme, "GAME_MENU_TRANSITION_EASE", "quint_in_out") or "quint_in_out")
        if mode == "quint_sep":
            return "in" if phase == "exit" else "out"
        return "in_out"

    def _плавно_поставить_rely_центра_меню(
        self,
        target: float,
        *,
        on_done: Callable[[], None] | None = None,
        ease: str = "out",
    ) -> None:
        self._отменить_анимацию_меню()
        gc = getattr(self, "_game_menu_center", None)
        if gc is None:
            if on_done:
                on_done()
            return

        total_ms = max(40, int(getattr(hub_theme, "GAME_MENU_TRANSITION_MS", 400) or 400))
        frame_ms = max(8, int(getattr(hub_theme, "GAME_MENU_TRANSITION_FRAME_MS", 14) or 14))

        try:
            start = float(gc.place_info().get("rely", target))
        except (tk.TclError, TypeError, ValueError):
            start = target

        if abs(start - target) < 1e-5:
            try:
                gc.place_configure(rely=target)
            except tk.TclError:
                pass
            if on_done:
                on_done()
            return

        t0 = time.perf_counter()
        guard = {"n": 0}

        def tick() -> None:
            guard["n"] += 1
            if guard["n"] > 600:
                self._menu_transition_after = None
                if on_done:
                    on_done()
                return
            now = time.perf_counter()
            elapsed_ms = (now - t0) * 1000.0
            tt = min(1.0, elapsed_ms / float(total_ms)) if total_ms > 0 else 1.0
            y = start + (target - start) * self._ease_меню_сегмент(tt, ease)
            try:
                gc.place_configure(rely=y)
            except tk.TclError:
                self._menu_transition_after = None
                if on_done:
                    on_done()
                return
            if tt >= 1.0:
                try:
                    gc.place_configure(rely=target)
                except tk.TclError:
                    pass
                self._menu_transition_after = None
                if on_done:
                    on_done()
                return
            self._menu_transition_after = self.after(frame_ms, tick)

        tick()

    def _меню_анимировать_переход(self, build_fn: Callable[[], None]) -> None:
        if getattr(self, "_menu_anim_running", False):
            if getattr(self, "_slide_in_from_empty_overlay", False):
                self._pending_menu_transition = None
                self._отменить_анимацию_меню()
                self._slide_in_from_empty_overlay = False
                gc = getattr(self, "_game_menu_center", None)
                if gc is not None:
                    try:
                        gc.place_configure(rely=self._game_menu_rely_base())
                    except tk.TclError:
                        pass
                self._menu_anim_running = False
                self._меню_анимировать_переход(build_fn)
                return
            self._pending_menu_transition = build_fn
            return
        self._отменить_анимацию_меню()
        self._menu_anim_running = True
        gc = getattr(self, "_game_menu_center", None)
        if gc is None:
            try:
                build_fn()
            finally:
                self._меню_анимация_завершена()
            return
        base = self._game_menu_rely_base()
        dest = self._game_menu_rely_slide_dest()
        ease_exit = self._ease_для_фазы_меню("exit")
        ease_enter = self._ease_для_фазы_меню("enter")

        def _въезд() -> None:
            self._плавно_поставить_rely_центра_меню(
                base,
                on_done=self._меню_slide_in_finished,
                ease=ease_enter,
            )

        def _после_выезда() -> None:
            self._очистить_центр_игрового_меню()
            build_fn()
            # Следующий тик цикла событий: не блокировать старт slide_in полной раскладкой сразу после pack.
            self.after(0, _въезд)

        def _после_выезда_deferred() -> None:
            """Кадр после slide_out, затем сборка — меньше рывка перед появлением списка."""
            self.after_idle(_после_выезда)

        def _schedule_после_выезда() -> None:
            hold = max(0, int(getattr(hub_theme, "GAME_MENU_TRANSITION_HOLD_MS", 0) or 0))
            self._menu_transition_after = None
            if hold > 0:

                def _go() -> None:
                    self._menu_transition_after = None
                    _после_выезда_deferred()

                self._menu_transition_after = self.after(max(1, hold), _go)
            else:
                _после_выезда_deferred()

        try:
            has_children = len(gc.winfo_children()) > 0
        except tk.TclError:
            has_children = False

        if not has_children:
            try:
                gc.place_configure(rely=dest)
            except tk.TclError:
                pass
            build_fn()
            self._slide_in_from_empty_overlay = True
            _въезд()
            return

        self._плавно_поставить_rely_центра_меню(
            dest,
            on_done=_schedule_после_выезда,
            ease=ease_exit,
        )

    def _фото_лого_главного_меню(self) -> tk.PhotoImage | None:
        """PNG «Данные/лого_меню_golden.png» для экрана главного меню (отдельно от ref подложки оверлея)."""
        path = os.path.join(self._корень, "Данные", "лого_меню_golden.png")
        try:
            if not os.path.isfile(path) or os.path.getsize(path) < 64:
                return None
        except Exception:
            return None
        mx = int(getattr(hub_theme, "GAME_MENU_LOGO_MAX_PX", 140) or 140)
        try:
            from PIL import Image, ImageTk

            im = Image.open(path).convert("RGBA")
            im.thumbnail((mx, mx), Image.Resampling.LANCZOS)
            ph = ImageTk.PhotoImage(im, master=self)
            self._game_menu_logo_photo = ph
            return ph
        except Exception:
            return None

    def _canvas_golden_section_title(self, parent: tk.Misc, bg: str) -> tk.Canvas:
        """Заголовок Golden Section: золото в два тона + смещённая тень (Tk.Label не даёт тень)."""
        from tkinter import font as tkfont

        t1 = "Golden "
        t2 = "Section"
        f1_spec = hub_theme.FONT_GAME_MENU_ORG_1
        f2_spec = hub_theme.FONT_GAME_MENU_ORG_2
        f1 = tkfont.Font(parent, font=f1_spec)
        f2 = tkfont.Font(parent, font=f2_spec)
        tw = f1.measure(t1) + f2.measure(t2)
        h = int(max(f1.metrics("linespace"), f2.metrics("linespace")) + 18)
        w = int(tw + 28)
        cv = tk.Canvas(parent, width=w, height=h, bg=bg, highlightthickness=0, bd=0)
        yc = h * 0.52
        x0 = 14
        shadow = str(getattr(hub_theme, "GAME_MENU_TITLE_SHADOW", "#1a0f08"))
        g1 = str(getattr(hub_theme, "GAME_MENU_TITLE_GOLD_1", hub_theme.GAME_MENU_WORD1_FG))
        g2 = str(getattr(hub_theme, "GAME_MENU_TITLE_GOLD_2", hub_theme.GAME_MENU_WORD2_FG))
        ox, oy = 3, 3
        for dx, dy, c1, c2 in ((ox, oy, shadow, shadow), (0, 0, g1, g2)):
            x = x0 + dx
            y = yc + dy
            cv.create_text(x, y, text=t1, font=f1_spec, fill=c1, anchor=tk.W)
            cv.create_text(x + f1.measure(t1), y, text=t2, font=f2_spec, fill=c2, anchor=tk.W)
        return cv

    def _показать_главное_игровое_меню(self) -> None:
        """Корневой экран: «Выполнение», «Утилиты» — кнопки одной ширины, текст по центру."""
        self._game_menu_mode = "main"
        self._game_util_buttons.clear()
        self._game_utils_list_fr = None
        mo = getattr(self, "_menu_overlay", None)
        if mo is None:
            return
        try:
            mo.grid()
            self._поднять_оверлей_меню_над_контентом()
        except tk.TclError:
            pass

        def _build_main() -> None:
            holder = tk.Frame(self._game_menu_center, bg=self._цвет_стекла_меню, highlightthickness=0)
            holder.pack()
            rim = tk.Frame(
                holder,
                bg=self._цвет_стекла_меню,
                highlightthickness=1,
                highlightbackground=hub_theme.GAME_MENU_FRAME_GLOW,
            )
            rim.pack()
            shell = tk.Frame(
                rim,
                bg=self._цвет_стекла_меню,
                highlightthickness=1,
                highlightbackground=hub_theme.GAME_MENU_FRAME_BORDER,
            )
            shell.pack(padx=4, pady=4, ipadx=48, ipady=36)
            logo_ph = self._фото_лого_главного_меню()
            if logo_ph is not None:
                tk.Label(
                    shell,
                    image=logo_ph,
                    bg=self._цвет_стекла_меню,
                    bd=0,
                    highlightthickness=0,
                ).pack(pady=(14, 12))
            title_cv = self._canvas_golden_section_title(shell, self._цвет_стекла_меню)
            title_cv.pack(pady=(0, 0) if logo_ph is not None else (4, 0))
            rule_wrap = tk.Frame(shell, bg=self._цвет_стекла_меню, highlightthickness=0)
            rule_wrap.pack(fill=tk.X, pady=(18, 0))
            rule_hi = tk.Frame(rule_wrap, height=1, bg=hub_theme.GAME_MENU_RULE_HI, highlightthickness=0)
            rule_hi.pack(fill=tk.X, padx=32)
            rule_lo = tk.Frame(rule_wrap, height=1, bg=hub_theme.GAME_MENU_RULE_LO, highlightthickness=0)
            rule_lo.pack(fill=tk.X, padx=32, pady=(2, 0))
            sub = tk.Label(
                shell,
                text="Выберите раздел",
                font=hub_theme.FONT_GAME_MENU_KICKER,
                bg=self._цвет_стекла_меню,
                fg=hub_theme.GAME_MENU_KICKER_FG,
            )
            sub.pack(pady=(16, 12))
            w_cta = self._ширина_cta_главного_меню_px(["Выполнение", "Утилиты"])
            btn_col = tk.Frame(shell, bg=self._цвет_стекла_меню, highlightthickness=0)
            btn_col.pack()
            btn_vyp = self._игровая_кнопка_меню(
                btn_col,
                "Выполнение",
                lambda: self._открыть_утилиту_с_главного_меню("Выполнение"),
                large=True,
                fixed_width_px=w_cta,
            )
            btn_vyp.pack(pady=(0, 10))
            btn_util = self._игровая_кнопка_меню(
                btn_col,
                "Утилиты",
                self._показать_список_утилит_игровое_меню,
                large=True,
                fixed_width_px=w_cta,
            )
            btn_util.pack(pady=(0, 0))

        self._меню_анимировать_переход(_build_main)

    def _открыть_утилиту_с_главного_меню(self, ключ: str) -> None:
        """Прямой переход на вкладку утилиты с игрового главного экрана (как при выборе из списка)."""
        if ключ not in self._tabs:
            try:
                tk_msg.showwarning(
                    "Утилита не найдена",
                    f"Вкладка «{ключ}» ещё не загружена.\n"
                    "Если папку утилиты только что добавили — нажмите F5 или перезапустите хаб.",
                    parent=self,
                )
            except Exception:
                pass
            return
        if not self._вкладка_видима(ключ):
            try:
                tk_msg.showwarning(
                    "Утилита недоступна",
                    f"«{ключ}» нет в текущем списке вкладок. Нажмите F5 для обновления.",
                    parent=self,
                )
            except Exception:
                pass
            return
        self._выбрать_вкладку(ключ)

    def _показать_список_утилит_игровое_меню(self) -> None:
        """Список утилит столбиком по центру (как меню игры)."""
        self._game_menu_mode = "utils"

        def _build_utils() -> None:
            col = tk.Frame(self._game_menu_center, bg=self._цвет_стекла_меню, highlightthickness=0)
            col.pack(side=tk.TOP)
            rim = tk.Frame(
                col,
                bg=self._цвет_стекла_меню,
                highlightthickness=1,
                highlightbackground=hub_theme.GAME_MENU_FRAME_GLOW,
            )
            rim.pack()
            shell = tk.Frame(
                rim,
                bg=self._цвет_стекла_меню,
                highlightthickness=1,
                highlightbackground=hub_theme.GAME_MENU_FRAME_BORDER,
            )
            shell.pack(padx=4, pady=4)
            inner = tk.Frame(shell, bg=self._цвет_стекла_меню, highlightthickness=0)
            inner.pack(ipadx=26, ipady=20)
            self._game_utils_list_fr = inner
            self._обновить_кнопки_утилит_в_меню(inner)

        self._меню_анимировать_переход(_build_utils)

    def _обновить_кнопки_утилит_в_меню(self, list_fr: tk.Frame | None = None) -> None:
        """Перестроить кнопки утилит (при скане / ошибках)."""
        if self._game_menu_mode != "utils":
            return
        parent = list_fr if list_fr is not None else self._game_utils_list_fr
        if parent is None:
            return
        try:
            for ch in parent.winfo_children():
                ch.destroy()
        except tk.TclError:
            pass
        self._game_util_buttons.clear()

        back_caption = "←  Назад"
        util_lines: list[str] = []
        util_rows: list[tuple[str, str, str, bool, Callable[[], None]]] = []
        hide_in_utils = getattr(hub_theme, "GAME_MENU_UTILS_LIST_HIDE_KEYS", frozenset())
        for key in self._keys_order:
            if key in hide_in_utils:
                continue
            meta = self._tabs.get(key)
            err = bool(meta and meta.get("error", {}).get("value"))
            if meta:
                info = meta["info"]
                line = f"{info.иконка}  {info.название}"
            else:
                line = f"⚙️  {key}"
            util_lines.append(line)

            def _pick(k: str = key) -> None:
                self._выбрать_вкладку(k)

            blurb = str(meta["info"].описание) if meta else ""
            util_rows.append((key, line, blurb, err, _pick))

        btn_col = self._ширина_колонки_игровых_кнопок_px([back_caption] + util_lines)

        back_fr = self._игровая_строка_меню_с_описанием(
            parent,
            back_caption,
            self._показать_главное_игровое_меню,
            описание="Вернуться к выбору раздела главного меню.",
            large=False,
            ширина_колонки_кнопки=btn_col,
            utility_row=False,
            в_карточке=False,
        )
        back_fr.pack(fill=tk.X)

        if not util_rows:
            tk.Label(
                parent,
                text="Нет утилит в папке «Утилиты».",
                bg=self._цвет_стекла_меню,
                fg=hub_theme.TEXT_DIM,
                font=hub_theme.FONT_BASE,
            ).pack(pady=(14, 4))
            return

        sep = tk.Frame(parent, height=1, bg=hub_theme.GAME_MENU_FRAME_BORDER, highlightthickness=0)
        sep.pack(fill=tk.X, padx=6, pady=(12, 16))

        for key_ut, line, blurb, err, cmd in util_rows:
            fr = self._игровая_строка_меню_с_описанием(
                parent,
                line,
                cmd,
                описание=blurb,
                large=False,
                err=err,
                ширина_колонки_кнопки=btn_col,
                utility_row=True,
                в_карточке=True,
            )
            fr.pack(fill=tk.X)
            self._game_util_buttons[key_ut] = fr

    def _скрыть_игровое_меню(self, *, animate: bool = True) -> None:
        """Скрыть полноэкранное меню. animate зарезервирован (сейчас скрытие всегда мгновенное)."""
        _ = animate
        self._pending_menu_transition = None
        self._menu_anim_running = False
        self._slide_in_from_empty_overlay = False
        self._отменить_анимацию_меню()
        mo = getattr(self, "_menu_overlay", None)
        if mo is None:
            return
        gc = getattr(self, "_game_menu_center", None)
        if gc is not None:
            try:
                gc.place_configure(rely=self._game_menu_rely_base())
            except tk.TclError:
                pass
        try:
            mo.grid_remove()
        except tk.TclError:
            pass
        try:
            self.after_idle(self._перерисовать_фон_и_карточку)
        except Exception:
            pass

    def _on_workspace_configure(self, _event=None) -> None:
        """Отложенная перерисовка фона при изменении размера окна (не дёргаем на каждый пиксель)."""
        if self._bg_job:
            try:
                self.after_cancel(self._bg_job)
            except Exception:
                pass
        self._bg_job = self.after(110, self._перерисовать_фон_и_карточку)

    def _приглушить_левый_край_под_сайдбар(self, composed: object, w: int, h: int, *, ширина_сайдбара: int | None = None) -> None:
        """Делает ленту под сайдбаром темнее (резерв); непрозрачная панель сайдбара всё равно перекроет её."""
        try:
            dim_a = float(getattr(hub_theme, "SIDEBAR_WALLPAPER_DIM_ALPHA", 0.0) or 0.0)
            if dim_a <= 0:
                return
            sw = int(ширина_сайдбара if ширина_сайдбара is not None else getattr(hub_theme, "HUB_SIDEBAR_WIDTH_PX", 312) or 312)
            bw = max(1, min(sw, w))
            bh = max(1, h)
            from PIL import Image

            left_strip = composed.crop((0, 0, bw, bh))
            tint = Image.new("RGB", left_strip.size, _hex_to_rgb(hub_theme.SIDEBAR_ELEVATED))
            left2 = Image.blend(left_strip, tint, max(0.0, min(1.0, dim_a)))
            composed.paste(left2, (0, 0))
        except Exception:
            pass

    def _обновить_матовую_подложку_карточки(self, card_x: float, card_y: float, card_w: int, card_h: int) -> None:
        lb = getattr(self, "_card_bg_label", None)
        if lb is None:
            return
        pil_full = self._workspace_full_pil
        if pil_full is None:
            try:
                lb.configure(image="")
            except Exception:
                pass
            self._card_gloss_refs.clear()
            return
        try:
            from PIL import Image, ImageTk

            iw, ih = pil_full.size
            x0 = max(0, min(int(round(card_x)), iw - 1))
            y0 = max(0, min(int(round(card_y)), ih - 1))
            x1 = max(x0 + 1, min(int(round(card_x + card_w)), iw))
            y1 = max(y0 + 1, min(int(round(card_y + card_h)), ih))
            slab = pil_full.crop((x0, y0, x1, y1))
            ga = max(0.0, min(1.0, float(getattr(hub_theme, "CARD_WALLPAPER_GLOSS_ALPHA", 0.76) or 0.0)))
            gx = getattr(hub_theme, "CARD_WALLPAPER_GLOSS_HEX", hub_theme.CARD_ALT)
            if ga >= 1.0:
                gloss = Image.new("RGB", slab.size, _hex_to_rgb(str(gx)))
            elif ga <= 0.0:
                gloss = slab
            else:
                gloss = Image.blend(slab, Image.new("RGB", slab.size, _hex_to_rgb(str(gx))), ga)
            ph = ImageTk.PhotoImage(gloss, master=self)
            self._card_gloss_refs = [ph]
            lb.configure(image=ph)
        except Exception:
            self._card_gloss_refs.clear()
            try:
                lb.configure(image="")
            except Exception:
                pass

    def _обновить_фото_подложки_меню(self, card_x: float, card_y: float, card_w: int, card_h: int, hx: int, hy: int) -> None:
        """Подложка игрового меню: тот же crop обоев, что под внутренней рамкой, + вуаль (Tk Frame непрозрачен)."""
        lb = getattr(self, "_menu_overlay_wallpaper_label", None)
        mo = getattr(self, "_menu_overlay", None)
        if lb is None:
            return
        pil_full = self._workspace_full_pil
        if pil_full is None:
            self._menu_overlay_photo_refs.clear()
            try:
                lb.configure(image="")
                if mo is not None:
                    mo.configure(bg=self._цвет_оверлей_меню)
            except Exception:
                pass
            return
        try:
            from PIL import Image, ImageTk

            if mo is not None:
                mo.configure(bg=self._цвет_карточки)
            iw, ih = pil_full.size
            ix0 = max(0, min(int(round(card_x + hx)), iw - 1))
            iy0 = max(0, min(int(round(card_y + hy)), ih - 1))
            ix1 = max(ix0 + 1, min(int(round(card_x + card_w - hx)), iw))
            iy1 = max(iy0 + 1, min(int(round(card_y + card_h - hy)), ih))
            slab = pil_full.crop((ix0, iy0, ix1, iy1))
            va = max(0.0, min(1.0, float(getattr(hub_theme, "GAME_MENU_WALLPAPER_VEIL_ALPHA", 0.38) or 0.0)))
            vhx = str(getattr(hub_theme, "GAME_MENU_WALLPAPER_VEIL_HEX", hub_theme.CARD_ALT))
            if va >= 1.0:
                out = Image.new("RGB", slab.size, _hex_to_rgb(vhx))
            elif va <= 0.0:
                out = slab
            else:
                out = Image.blend(slab, Image.new("RGB", slab.size, _hex_to_rgb(vhx)), va)
            ph = ImageTk.PhotoImage(out, master=self)
            self._menu_overlay_photo_refs = [ph]
            lb.configure(image=ph)
            try:
                gc = getattr(self, "_game_menu_center", None)
                if gc is not None:
                    gc.lift(lb)
            except Exception:
                pass
        except Exception:
            self._menu_overlay_photo_refs.clear()
            try:
                lb.configure(image="")
                if mo is not None:
                    mo.configure(bg=self._цвет_оверлей_меню)
            except Exception:
                pass

    def _нарисовать_градиент_запасной(self, canvas: tk.Canvas, w: int, h: int) -> None:
        """Если картинка из сети недоступна — градиент в тон палитре хаба (без внешних библиотек)."""

        def _hx(hc: str) -> tuple[int, int, int]:
            hc = hc.lstrip("#")
            return (int(hc[0:2], 16), int(hc[2:4], 16), int(hc[4:6], 16))

        top = _hx(hub_theme.CANVAS_TOP)
        bot = _hx(hub_theme.CANVAS_BOTTOM)
        steps = max(28, min(48, h // 12))
        for i in range(steps):
            y0 = int(h * i / steps)
            y1 = int(h * (i + 1) / steps) + 1
            t = i / max(1, steps - 1)
            r = int(top[0] + (bot[0] - top[0]) * t)
            g = int(top[1] + (bot[1] - top[1]) * t)
            b = int(top[2] + (bot[2] - top[2]) * t)
            color = f"#{r:02x}{g:02x}{b:02x}"
            canvas.create_rectangle(0, y0, w, y1, outline="", fill=color, tags="gradient")

    def _pil_градиент_хаба(self, w: int, h: int) -> object | None:
        """Тот же вертикальный градиент, что у `_нарисовать_градиент_запасной`, в RGB для PIL (сайдбар)."""
        try:
            from PIL import Image

            if w < 2 or h < 2:
                return None

            def _hx(hc: str) -> tuple[int, int, int]:
                hc = hc.lstrip("#")
                return (int(hc[0:2], 16), int(hc[2:4], 16), int(hc[4:6], 16))

            top = _hx(hub_theme.CANVAS_TOP)
            bot = _hx(hub_theme.CANVAS_BOTTOM)
            steps = max(28, min(48, h // 12))
            im = Image.new("RGB", (w, h))
            px = im.load()
            for i in range(steps):
                y0 = int(h * i / steps)
                y1 = int(h * (i + 1) / steps) + 1
                t = i / max(1, steps - 1)
                r = int(top[0] + (bot[0] - top[0]) * t)
                g = int(top[1] + (bot[1] - top[1]) * t)
                b_ = int(top[2] + (bot[2] - top[2]) * t)
                for yy in range(y0, min(y1, h)):
                    for xx in range(w):
                        px[xx, yy] = (r, g, b_)
            return im
        except Exception:
            return None

    def _нарисовать_скрим_над_обоями(self, canvas: tk.Canvas, w: int, h: int) -> None:
        """Приглушение фото: dither-слой в цвет сайдбара (эффект «полупрозрачной» плёнки, Tk без альфы)."""
        try:
            canvas.create_rectangle(
                0,
                0,
                w,
                h,
                outline="",
                fill=hub_theme.WALLPAPER_SCRIM_FILL,
                stipple=hub_theme.WALLPAPER_SCRIM_STIPPLE,
                tags=("wallpaper_scrim",),
            )
        except tk.TclError:
            for stipple in ("gray50", "gray25"):
                try:
                    canvas.create_rectangle(
                        0,
                        0,
                        w,
                        h,
                        outline="",
                        fill=hub_theme.WALLPAPER_SCRIM_FILL,
                        stipple=stipple,
                        tags=("wallpaper_scrim",),
                    )
                    break
                except tk.TclError:
                    continue

        if bool(getattr(hub_theme, "WALLPAPER_SCRIM_SECOND_LAYER", True)):
            try:
                canvas.create_rectangle(
                    0,
                    0,
                    w,
                    h,
                    outline="",
                    fill=hub_theme.ACCENT_DIM,
                    stipple="gray87",
                    tags=("wallpaper_scrim",),
                )
            except tk.TclError:
                pass

    def _перерисовать_фон_и_карточку(self) -> None:
        """Обои на весь `_workspace_canvas`, сайдбар и карточка через create_window; матовый crop на карточке при PIL."""
        self._bg_job = None
        c = self._workspace_canvas
        if c is None:
            return
        try:
            w = max(c.winfo_width(), 40)
            h = max(c.winfo_height(), 40)
        except Exception:
            return

        cnt = getattr(self, "_dbg_redraw_n", 0) + 1
        self._dbg_redraw_n = cnt
        if cnt <= 10:
            отладка.записать(
                {
                    "hypothesisId": "H4",
                    "location": "_перерисовать_фон_и_карточку",
                    "message": f"redraw_{cnt}",
                    "data": {"w": w, "h": h, "bg_path_set": bool(self._bg_path)},
                }
            )

        sw = self._ширина_сайдбара_пикс()
        div_w = max(0, int(getattr(hub_theme, "HUB_DIVIDER_AFTER_SIDEBAR_PX", 0) or 0))
        mL = int(getattr(hub_theme, "HERO_MARGIN_L", 10) or 10)
        mR = int(getattr(hub_theme, "HERO_MARGIN_R", 16) or 16)
        mT = int(getattr(hub_theme, "HERO_MARGIN_T", 12) or 12)
        mB = int(getattr(hub_theme, "HERO_MARGIN_B", 8) or 8)
        pad = int(getattr(hub_theme, "HUB_CARD_INSET_PAD", 22) or 22)

        hero_x = float(sw + div_w + mL)
        hero_y = float(mT)
        hero_w = max(260, int(w - hero_x - mR))
        hero_h = max(260, int(h - hero_y - mB))
        card_x = hero_x + float(pad)
        card_y = hero_y + float(pad)
        card_w_i = max(260, hero_w - 2 * pad)
        card_h_i = max(260, hero_h - 2 * pad)

        c.delete("wallpaper", "gradient", "card_shadow", "wallpaper_scrim", "divider")
        self._bg_photo_refs.clear()
        self._card_gloss_refs.clear()
        self._menu_overlay_photo_refs.clear()
        self._workspace_full_pil = None
        self._card_shadow_rect = None

        path = self._bg_path
        had_photo = False
        wallpaper_from_pil = False
        if path and os.path.isfile(path):
            composed = _собрать_герой_обои_pil(path, w, h)
            if composed is not None:
                try:
                    from PIL import ImageTk

                    self._приглушить_левый_край_под_сайдбар(composed, w, h, ширина_сайдбара=sw)
                    self._workspace_full_pil = composed

                    _ti_img = time.time()
                    img = ImageTk.PhotoImage(composed, master=self)
                    self._bg_photo_refs.append(img)
                    if cnt <= 6:
                        отладка.записать(
                            {
                                "hypothesisId": "H3",
                                "location": "_перерисовать_фон_и_карточку",
                                "message": "PIL_wallpaper_loaded",
                                "data": {"compose_ms": int((time.time() - _ti_img) * 1000)},
                            }
                        )
                    c.create_image(w // 2, h // 2, image=img, anchor=tk.CENTER, tags="wallpaper")
                    had_photo = True
                    wallpaper_from_pil = True
                except Exception:
                    self._workspace_full_pil = None
                    wallpaper_from_pil = False
            if not wallpaper_from_pil:
                try:
                    _ti_img = time.time()
                    raw = tk.PhotoImage(file=path)
                    rw, rh = raw.width(), raw.height()
                    sfx = max(1, (rw + w - 1) // w)
                    sfy = max(1, (rh + h - 1) // h)
                    sf = max(sfx, sfy)
                    img = raw.subsample(sf, sf)
                    self._bg_photo_refs.extend([raw, img])
                    if cnt <= 6:
                        отладка.записать(
                            {
                                "hypothesisId": "H3",
                                "location": "_перерисовать_фон_и_карточку",
                                "message": "PhotoImage_loaded",
                                "data": {"decode_subsample_ms": int((time.time() - _ti_img) * 1000), "rw": rw, "rh": rh, "sf": sf},
                            }
                        )
                    c.create_image(w // 2, h // 2, image=img, anchor=tk.CENTER, tags="wallpaper")
                    had_photo = True
                except Exception:
                    self._нарисовать_градиент_запасной(c, w, h)
        else:
            self._нарисовать_градиент_запасной(c, w, h)

        if had_photo and not wallpaper_from_pil:
            self._нарисовать_скрим_над_обоями(c, w, h)

        if div_w > 0:
            x_div = float(sw) + float(div_w) / 2.0
            try:
                c.create_line(x_div, 0, x_div, float(h), fill=hub_theme.SIDEBAR_BORDER, width=max(1, div_w), tags=("divider",))
            except tk.TclError:
                pass

        if self._card_win is not None:
            try:
                c.coords(self._card_win, card_x, card_y)
                c.itemconfig(self._card_win, width=card_w_i, height=card_h_i)
                c.tag_raise(self._card_win)
            except Exception:
                pass

        self._обновить_матовую_подложку_карточки(card_x, card_y, card_w_i, card_h_i)
        hx_m, hy_m = hub_theme.PAD_HUB_CARD
        self._обновить_фото_подложки_меню(card_x, card_y, card_w_i, card_h_i, hx_m, hy_m)

        try:
            mo = getattr(self, "_menu_overlay", None)
            if mo is not None and mo.winfo_ismapped():
                self._поднять_оверлей_меню_над_контентом()
        except Exception:
            pass

    def _инициализировать_настройки_по_умолчанию(self) -> None:
        """При первом запуске создаём файл настроек и заполняем списки вкладок."""
        changed = False
        if "tab_keys_ordered" not in self._настройки:
            infos = Сканер.сканировать(self._корень)
            self._настройки["tab_keys_ordered"] = [i.ключ for i in infos]
            changed = True
        if "selected_key" not in self._настройки and self._настройки.get("tab_keys_ordered"):
            self._настройки["selected_key"] = self._настройки["tab_keys_ordered"][0]
            changed = True
        if changed:
            _сохранить_настройки(self._корень, self._настройки)

    def _построить_вкладки_из_настроек_и_скана(self) -> None:
        """Синхронизируем список ключей с диском: удаляем мёртвые, добавляем новые."""
        infos = Сканер.сканировать(self._корень)
        valid = {i.ключ for i in infos}
        info_by_key = {i.ключ: i for i in infos}

        saved_order = list(self._настройки.get("tab_keys_ordered") or [])
        # Убираем отсутствующие на диске
        order = [k for k in saved_order if k in valid]
        # Добавляем новые (в конец, по алфавиту новых)
        new_keys = sorted(valid - set(order), key=str.lower)
        order.extend(new_keys)

        self._keys_order = order
        self._настройки["tab_keys_ordered"] = order
        _сохранить_настройки(self._корень, self._настройки)

        _agent_debug_ndjson("H2", "Окно._построить_вкладки_из_настроек_и_скана", "tabs_build_start", {"n_tabs": len(order), "keys": order[:20]})
        # Создаём вкладки для каждого ключа в order
        for k in order:
            if k not in self._tabs:
                self._создать_вкладку(k, info_by_key.get(k))
        # Удаляем лишние виджеты если ключ исчез (редко — уже вычищено из order)
        for k in list(self._tabs.keys()):
            if k not in order:
                self._удалить_вкладку_полностью(k)

        self._текущий_ключ = None
        self._показать_главное_игровое_меню()
        self._обновить_меню_список()
        _agent_debug_ndjson("H2", "Окно._построить_вкладки_из_настроек_и_скана", "tabs_build_done", {"n_tabs": len(self._tabs)})

    def _создать_вкладку(self, key: str, info: Сканер.УтилитаИнфо | None) -> None:
        if key in self._tabs:
            return
        if info is None:
            # Попробуем пересканировать одну
            for i in Сканер.сканировать(self._корень):
                if i.ключ == key:
                    info = i
                    break
        if info is None:
            return

        outer = tk.Frame(self._tabs_host, bg=self._цвет_карточки)
        inner = tk.Frame(outer, bg=self._цвет_карточки)
        inner.pack(fill=tk.BOTH, expand=True)

        err_flag = {"value": False}

        def set_error(on: bool) -> None:
            err_flag["value"] = on
            self._подсветить_ошибку_вкладки(key, on)

        # Утилита может вызвать: getattr(родитель, "report_tab_error", lambda x: None)(True/False)
        inner.report_tab_error = set_error  # type: ignore[attr-defined]

        def hub_log_error(message: str) -> None:
            self._журнал(f"Утилита «{key}»: {message}", "ERROR")
            set_error(True)

        def hub_clear_error() -> None:
            set_error(False)

        inner.hub_log_error = hub_log_error  # type: ignore[attr-defined]
        inner.hub_clear_error = hub_clear_error  # type: ignore[attr-defined]
        inner._pto_hub_root = self._корень  # type: ignore[attr-defined]

        meta = {
            "key": key,
            "info": info,
            "outer": outer,
            "inner": inner,
            "error": err_flag,
        }
        self._tabs[key] = meta

        # Загрузка модуля
        try:
            spec = importlib.util.spec_from_file_location(f"util_{key}", info.путь_запуск)
            if spec is None or spec.loader is None:
                raise RuntimeError("Не удалось создать spec для Запуск.py")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)  # type: ignore
            self._модули[key] = mod
            fn = getattr(mod, "запустить", None)
            if not callable(fn):
                raise RuntimeError("В Запуск.py нет функции запустить(родитель)")
            _agent_debug_ndjson("H2", "Окно._создать_вкладку", "util_fn_before", {"key": key})
            t0 = time.perf_counter()
            fn(inner)
            _agent_debug_ndjson(
                "H2",
                "Окно._создать_вкладку",
                "util_fn_after",
                {"key": key, "elapsed_ms": int((time.perf_counter() - t0) * 1000)},
            )
            self._журнал(f"Утилита загружена: {key}", "INFO")
        except Exception as e:
            self._журнал(f"Ошибка загрузки утилиты «{key}»: {e}", "ERROR")
            err_flag["value"] = True
            tk.Label(
                inner,
                text=f"Не удалось загрузить утилиту.\n{e}",
                fg=hub_theme.ERROR_FG,
                bg=self._цвет_карточки,
                justify=tk.LEFT,
                font=hub_theme.FONT_BASE,
            ).pack(anchor=tk.W, padx=8, pady=8)

    def _обновить_меню_список(self) -> None:
        """Обновляет центральный список кнопок утилит (если открыт экран «Утилиты»)."""
        try:
            self._обновить_кнопки_утилит_в_меню()
        except Exception:
            pass

    def _стилизовать_пункты_меню(self) -> None:
        """Перерисовать кнопки утилит при смене статуса ошибки."""
        try:
            self._обновить_кнопки_утилит_в_меню()
        except Exception:
            pass

    def _подсветить_ошибку_вкладки(self, _key: str, _on: bool) -> None:
        """Ошибка уже записана в meta['error']; обновляем цвет строки в меню."""
        self._стилизовать_пункты_меню()

    def _вкладка_видима(self, key: str) -> bool:
        return key in self._keys_order

    def _выбрать_вкладку(self, key: str) -> None:
        if key not in self._tabs:
            return
        if not self._вкладка_видима(key):
            return
        self._текущий_ключ = key
        for k, meta in self._tabs.items():
            if k == key:
                meta["outer"].pack(fill=tk.BOTH, expand=True)
            else:
                meta["outer"].pack_forget()
        self._настройки["selected_key"] = key
        _сохранить_настройки(self._корень, self._настройки)
        self._скрыть_игровое_меню(animate=False)
        self._стилизовать_пункты_меню()

    def _закрыть_текущую_вкладку(self) -> None:
        if not self._текущий_ключ:
            return
        self._закрыть_вкладку(self._текущий_ключ)

    def _закрыть_вкладку(self, key: str) -> None:
        if key not in self._keys_order:
            return
        self._last_closed = key
        self._настройки["last_closed_key"] = key
        self._keys_order = [k for k in self._keys_order if k != key]
        self._настройки["tab_keys_ordered"] = list(self._keys_order)
        _сохранить_настройки(self._корень, self._настройки)
        was_sel = self._текущий_ключ == key
        self._удалить_вкладку_полностью(key)
        self._обновить_меню_список()
        if was_sel:
            nxt = next((k for k in self._keys_order if self._вкладка_видима(k)), None)
            if nxt:
                self._выбрать_вкладку(nxt)
            else:
                self._текущий_ключ = None
                self._показать_главное_игровое_меню()
        self._журнал(f"Вкладка закрыта: {key}", "INFO")

    def _удалить_вкладку_полностью(self, key: str) -> None:
        meta = self._tabs.pop(key, None)
        self._модули.pop(key, None)
        if not meta:
            return
        try:
            meta["outer"].destroy()
        except Exception:
            pass

    def _вернуть_закрытую(self) -> None:
        if not self._last_closed:
            return
        key = self._last_closed
        infos = Сканер.сканировать(self._корень)
        valid = {i.ключ for i in infos}
        if key not in valid:
            self._журнал(f"Нельзя вернуть вкладку «{key}»: папки нет", "WARN")
            return
        if key not in self._keys_order:
            self._keys_order.append(key)
            self._настройки["tab_keys_ordered"] = list(self._keys_order)
            _сохранить_настройки(self._корень, self._настройки)
            info = next(i for i in infos if i.ключ == key)
            self._создать_вкладку(key, info)
        self._обновить_меню_список()
        self._выбрать_вкладку(key)
        self._журнал(f"Вкладка восстановлена: {key}", "INFO")

    def _следующая_вкладка(self) -> None:
        vis = [k for k in self._keys_order if self._вкладка_видима(k)]
        if not vis:
            return
        if not self._текущий_ключ or self._текущий_ключ not in vis:
            self._выбрать_вкладку(vis[0])
            return
        i = vis.index(self._текущий_ключ)
        nxt = vis[(i + 1) % len(vis)]
        self._выбрать_вкладку(nxt)

    def _schedule_scan(self) -> None:
        try:
            self._фоновое_обновление_списка()
        except Exception as e:
            self._журнал(f"Ошибка фонового сканирования: {e}", "ERROR")
        self.after(60_000, self._schedule_scan)

    def _фоновое_обновление_списка(self) -> None:
        """Новые папки → новая вкладка; удалённые → закрыть без шума."""
        infos = Сканер.сканировать(self._корень)
        valid = {i.ключ for i in infos}
        info_by_key = {i.ключ: i for i in infos}

        # Удалённые папки — закрываем вкладки без ошибок в интерфейсе
        for key in [k for k in self._keys_order if k not in valid]:
            self._журнал(f"Папка утилиты удалена, вкладка снята: {key}", "INFO")
            if self._текущий_ключ == key:
                self._текущий_ключ = None
            self._keys_order = [k for k in self._keys_order if k != key]
            self._удалить_вкладку_полностью(key)

        # Новые
        for key in sorted(valid - set(self._keys_order), key=str.lower):
            self._keys_order.append(key)
            self._создать_вкладку(key, info_by_key[key])
            self._журнал(f"Обнаружена новая утилита, добавлена вкладка: {key}", "INFO")

        # Обновить подписи, если поменяли «Обозначение.txt»
        for i in infos:
            meta = self._tabs.get(i.ключ)
            if not meta:
                continue
            meta["info"] = i

        self._настройки["tab_keys_ordered"] = list(self._keys_order)
        _сохранить_настройки(self._корень, self._настройки)
        self._обновить_меню_список()
        if self._текущий_ключ and self._текущий_ключ not in self._keys_order:
            self._текущий_ключ = None
        if self._текущий_ключ is None:
            if self._game_menu_mode == "utils":
                self._обновить_меню_список()
            else:
                self._показать_главное_игровое_меню()

    def _schedule_autosave(self) -> None:
        try:
            for key, mod in list(self._модули.items()):
                fn = getattr(mod, "автосохранить", None)
                if callable(fn):
                    try:
                        fn()
                    except Exception as e:
                        self._журнал(f"Автосохранение «{key}»: {e}", "ERROR")
                        meta = self._tabs.get(key)
                        if meta:
                            meta["error"]["value"] = True
                            self._подсветить_ошибку_вкладки(key, True)
        except Exception as e:
            self._журнал(f"Цикл автосохранения: {e}", "ERROR")
        self.after(30_000, self._schedule_autosave)

    def _привязать_горячие_клавиши(self) -> None:
        self.bind_all("<Control-Tab>", self._hot_ctrl_tab)
        self.bind_all("<Control-w>", self._hot_ctrl_w)
        self.bind_all("<Control-W>", self._hot_ctrl_w)
        self.bind_all("<Control-Shift-T>", self._hot_ctrl_shift_t)
        self.bind_all("<Control-Shift-t>", self._hot_ctrl_shift_t)
        self.bind_all("<F5>", self._hot_f5)

    def _hot_ctrl_tab(self, _e=None) -> str | None:
        self._следующая_вкладка()
        return "break"

    def _hot_ctrl_w(self, _e=None) -> str | None:
        self._закрыть_текущую_вкладку()
        return "break"

    def _hot_ctrl_shift_t(self, _e=None) -> str | None:
        self._вернуть_закрытую()
        return "break"

    def _hot_f5(self, _e=None) -> str | None:
        self._журнал("Принудительное обновление списка утилит (F5)", "INFO")
        self._фоновое_обновление_списка()
        return "break"

    def _on_close(self) -> None:
        try:
            self._настройки["geometry"] = self.geometry()
            self._настройки["tab_keys_ordered"] = list(self._keys_order)
            self._настройки["selected_key"] = self._текущий_ключ
            self._настройки["last_closed_key"] = self._last_closed
            _сохранить_настройки(self._корень, self._настройки)
        except Exception:
            pass
        # Финальный автосохранительный проход
        try:
            for _key, mod in list(self._модули.items()):
                fn = getattr(mod, "автосохранить", None)
                if callable(fn):
                    try:
                        fn()
                    except Exception:
                        pass
        except Exception:
            pass
        self._журнал("Выход из хаба", "INFO")
        self.destroy()


def главная(корень_хаба: str) -> None:
    _agent_debug_ndjson("H0", "Окно.главная", "before_Hub创建", {})
    app = ХабУтилит(корень_хаба)
    _agent_debug_ndjson("H0", "Окно.главная", "after_Hub_init_before_mainloop", {})
    app.mainloop()
