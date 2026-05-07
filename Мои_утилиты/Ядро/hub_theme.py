# -*- coding: utf-8 -*-
"""
Единая палитра и настройки ttk для хаба ПТО: общий фон (фото + вуаль) и тёмные «стеклянные» панели.
На Windows базовая тема ttk — clam (vista даёт белый Listbox/Treeview и кнопки, несовместимые с тёмной палитрой).
"""

from __future__ import annotations

import sys
import tkinter as tk
from tkinter import ttk

# —— Палитра —— (slate + sky, контраст и читаемость)
ACCENT = "#0ea5e9"
ACCENT_HOVER = "#38bdf8"
ACCENT_DIM = "#0369a1"
ACCENT_FG = "#ffffff"
ACCENT_GLOW = "#7dd3fc"

SIDEBAR_BG = "#0c1222"
SIDEBAR_ELEVATED = "#151d2e"
SIDEBAR_SURFACE = "#1e2a3f"
SIDEBAR_BORDER = "#334155"
SIDEBAR_TEXT = "#f8fafc"
SIDEBAR_MUTED = "#94a3b8"
# Список утилит: не кричащее выделение; фон «лотка» чуть глубже поверхности
SIDEBAR_LIST_INSET = "#121b2e"
SIDEBAR_SELECT_BG = "#1a3a52"
SIDEBAR_SELECT_FG = "#e8f4fc"
ERROR_FG = "#f87171"

SIDEBAR_SCROLL_TROUGH = "#0d1524"
SIDEBAR_SCROLL_THUMB = "#3d4f66"
SIDEBAR_SCROLL_THUMB_ACTIVE = "#4b6b8a"

CANVAS_TOP = "#080f1a"
CANVAS_BOTTOM = "#12283e"

CARD = "#1a2434"
CARD_ALT = "#141c28"
BORDER = "#3d5266"
BORDER_STRONG = "#5c6e82"
CARD_SHADOW_FILL = "#040810"
# Tk.Text и др. многострочные блоки; ttk.Entry — TEXT_FIELD_BG.
TEXT_AREA_BG = "#182333"
TEXT_FIELD_BG = "#1e2d42"
# Плёнка поверх фото (stipple Tk — имитация полупрозрачности без Pillow / без альфы у PhotoImage).
# Светлее — без PIL фото не «убивается» в сплошную грязь.
WALLPAPER_SCRIM_FILL = "#121a28"
WALLPAPER_SCRIM_STIPPLE = "gray62"
# Второй слой ACCENT_DIM + gray87 сильно темнит; False — заметнее обои на пути без PIL.
WALLPAPER_SCRIM_SECOND_LAYER = False

# Обои через PIL (_перерисовать фон хаба): гладкая плёнка, без stipple на основном пути.
WALLPAPER_SOURCE_MAX_SIDE = 2560  # ограничение исходника до cover+LANCZOS (меньше пик при ресайзе окна)
WALLPAPER_FILM_HEX = "#060a10"  # лёгкая тёмная вуаль: листва читается, текст поверх панелей контрастный
WALLPAPER_FILM_ALPHA = 0.06
WALLPAPER_BLUR_RADIUS_PX = 0.2
WALLPAPER_VIGNETTE_STRENGTH = 0.18

# Полноэкранный холст под сайдбар + рабочую область (_workspace_canvas в Окно).
HUB_SIDEBAR_WIDTH_PX = 312
# Узкая «рейка» при свёрнутом меню (иконки + шеврон), как в IDE (VS Code и т.п.).
HUB_SIDEBAR_COLLAPSED_WIDTH_PX = 56
HUB_SIDEBAR_TOGGLE_H_PX = 34
HUB_DIVIDER_AFTER_SIDEBAR_PX = 0  # 0 — без вертикальной линии между сайдбаром и рабочей зоной
# Единый фон приложения: «Данные/фон_хаба.png» (или кэш), иначе градиент.
HUB_USE_PHOTO_WALLPAPER = True
HERO_MARGIN_L = 10  # между разделителем и краем «героя»
HERO_MARGIN_R = 16
HERO_MARGIN_T = 12
HERO_MARGIN_B = 8
HUB_CARD_INSET_PAD = 24  # чуть шире кайма — больше обоев вокруг панели утилиты

# Подложка для полосы сайдбара при композите (резерв; сплошная панель по-прежнему непрозрачна для Tk).
SIDEBAR_WALLPAPER_DIM_ALPHA = 0.5

# Обои сайдбара при отдельной сборке (fallback без PIL героя); при основном пути — crop с общего изображения холста.
SIDEBAR_WALLPAPER_SOURCE_MAX_SIDE = 2560
SIDEBAR_WALLPAPER_FILM_HEX = WALLPAPER_FILM_HEX
SIDEBAR_WALLPAPER_FILM_ALPHA = 0.18
SIDEBAR_WALLPAPER_BLUR_RADIUS_PX = 0.85
SIDEBAR_WALLPAPER_VIGNETTE_STRENGTH = 0.42
# Доли ширины/высоты сайдбара [0..1]: затемнение под «остров» списка (цвет SIDEBAR_LIST_INSET для стыка с Listbox).
SIDEBAR_LIST_SCRIM_RECT = (0.05, 0.36, 0.95, 0.90)
SIDEBAR_LIST_SCRIM_ALPHA = 0.72

# Подложка под отступ_pad карточки хаба: смесь обоев с тёмным тоном («стекло» за краем панели утилиты).
CARD_WALLPAPER_GLOSS_HEX = "#0a1018"
# Ниже — больше обоев «просвечивает» под карточкой (Tk не умеет альфу у Frame; эффект через матовый crop).
CARD_WALLPAPER_GLOSS_ALPHA = 0.06

# Полноэкранное игровое меню: тёплая вуаль (меньше «синего ящика» на промышленном фото)
GAME_MENU_OVERLAY_WITH = "#2a231c"
GAME_MENU_OVERLAY_BLEND = 0.46
# «Стекло» панели меню (смесь с более светлым тоном; сила 0.12–0.18 заметна глазу).
GAME_MENU_GLASS_STRENGTH = 0.14
GAME_MENU_GLASS_TINT = "#5c6a80"
# Кнопки стартового экрана «Утилиты» / общий fallback для меню.
GAME_MENU_BUTTON_BG = "#2a3a50"
GAME_MENU_BUTTON_BG_HOVER = "#334760"
# Подложка игрового меню: crop тех же обоев + лёгкая вуаль (иначе весь overlay — сплошной цвет).
GAME_MENU_WALLPAPER_VEIL_ALPHA = 0.30
GAME_MENU_WALLPAPER_VEIL_HEX = "#141c28"

# Центральная панель меню при смене экрана: place rely 0.5 + anchor=center (геом. центр оверлея).
GAME_MENU_RELY_CENTER = 0.50
GAME_MENU_RELY_SLIDE = 0.052  # доля высоты: чуть заметнее «уход» перед сменой контента
# Анимация смены экранов меню: время — по часам, не фикс. число шагов (плавнее на разных ПК).
GAME_MENU_TRANSITION_MS = 380
GAME_MENU_TRANSITION_FRAME_MS = 11
GAME_MENU_TRANSITION_HOLD_MS = 0  # лог показал: пауза внизу — «ступень» перед сменой экрана
# После очереди переходов (нет обрыва slide_in/out) quint_in_out снова воспринимается плавнее
GAME_MENU_TRANSITION_EASE = "quint_in_out"
# Зарезервировано на случай отката к ступенчатой анимации (Окно сейчас не использует).
GAME_MENU_TRANSITION_STEPS = 12
# Ключи вкладок (имя папки в «Утилиты») — не показывать в списке экрана «Утилиты»; вход только с главного экрана меню.
GAME_MENU_UTILS_LIST_HIDE_KEYS = frozenset({"Выполнение"})

# Игровое меню: палитра «премиум золото / янтарь», без кислотного плаката
GAME_MENU_FRAME_GLOW = "#d4a574"
GAME_MENU_FRAME_BORDER = "#5c4a3d"
GAME_MENU_RULE_HI = "#fffbeb"
GAME_MENU_RULE_LO = "#d97706"
GAME_MENU_RULE = GAME_MENU_RULE_LO
GAME_MENU_WORD1_FG = "#fffef5"
GAME_MENU_WORD2_FG = "#fde047"
GAME_MENU_TITLE_SHADOW = "#1a0f08"
GAME_MENU_TITLE_GOLD_1 = "#fde68a"
GAME_MENU_TITLE_GOLD_2 = "#eab308"
GAME_MENU_KICKER_FG = "#d6c8b4"
GAME_MENU_PRIMARY_BG = "#b45309"
GAME_MENU_PRIMARY_BG_HOVER = "#ea580c"
GAME_MENU_PRIMARY_FG = "#fffefb"
GAME_MENU_PRIMARY_BORDER = "#78350f"
GAME_MENU_PRIMARY_BORDER_HOVER = "#fde68a"

# Список утилит в игровом меню: карточки и мягкие кнопки «под стекло».
GAME_MENU_LIST_CARD_BG = "#1c2433"
GAME_MENU_LIST_BTN_BG = "#2c3548"
GAME_MENU_LIST_BTN_BG_HOVER = "#3d4a63"
GAME_MENU_LIST_BTN_BORDER = "#5c5347"
GAME_MENU_LIST_BTN_BORDER_HOVER = "#c4a574"
GAME_MENU_LIST_DESC_FG = "#cfc6b8"
GAME_MENU_LIST_WRAPLENGTH = 480

# Совместимость
GAME_MENU_STRIPE_TOP = GAME_MENU_RULE_HI
GAME_MENU_STRIPE_BOTTOM = GAME_MENU_RULE_LO
GAME_MENU_TITLE_FG = GAME_MENU_WORD1_FG
GAME_MENU_ACCENT_STRIPE = GAME_MENU_RULE_LO

TEXT = "#f1f5f9"
TEXT_DIM = "#94a3b8"

SUCCESS = "#0d9488"
SUCCESS_FG = "#ffffff"
DANGER = "#dc2626"

PROGRESS_TROUGH = "#243449"

SURFACE_SOFT = "#1a3040"
SURFACE_SOFT_MID = "#243548"
TEXT_ON_SOFT = "#7dd3fc"

TREE_GROUP_FILE_BG = "#1e2d42"
TREE_GROUP_MARK_BG = "#243449"
TREE_STRIPE_A = CARD
TREE_STRIPE_B = "#152030"
TREE_HEAD_BG = "#243449"
TREE_TOTAL_BG = "#1a3b45"

# Токены дашборда «Выполнение»
DASH_CHART_BG = "#141c28"
DASH_AXIS_TEXT = "#cbd5e1"
DASH_MUTED_TEXT = "#7b8ba1"
DASH_GRID = "#2c3f56"
DASH_EMPTY_BG = "#101827"
DASH_EMPTY_TEXT = "#94a3b8"

def _bootstrap_hub_ttk_theme(style: ttk.Style) -> None:
    """На Windows тема vista рисует Treeview/часть ttk системным белым и игнорирует background. clam даёт предсказуемые цвета."""
    if sys.platform != "win32":
        return
    for name in ("clam", "alt", "default", "classic"):
        try:
            style.theme_use(name)
            return
        except tk.TclError:
            continue


FF = "Segoe UI"
# Заголовки и акценты: Semilight на Windows выглядит мягче обычного Bold.
FONT_UI_DISPLAY = "Segoe UI Semilight"


def _game_menu_display_face() -> str:
    """Segoe UI Variable* (Win10+) — современный fluent UI; иначе Semilight."""
    try:
        import tkinter.font as tkfont

        avail = list(tkfont.families())
        for want in ("Segoe UI Variable Display", "Segoe UI Variable Text", "Segoe UI Variable"):
            if want in avail:
                return want
        low = {f.lower(): f for f in avail}
        for key in ("segoe ui variable display", "segoe ui variable text", "segoe ui variable"):
            if key in low:
                return low[key]
    except Exception:
        pass
    return FONT_UI_DISPLAY


FONT_GAME_MENU_DISPLAY = _game_menu_display_face()
# Заглавный экран: Variable/Semilight + жирный Segoe для второго слова (надёжный bold)
FONT_GAME_MENU_ORG_1 = (FONT_GAME_MENU_DISPLAY, 29)
FONT_GAME_MENU_ORG_2 = (FF, 30, "bold")
FONT_GAME_MENU_TITLE = (FONT_GAME_MENU_DISPLAY, 27)
FONT_GAME_MENU_KICKER = (FF, 10)
FONT_GAME_MENU_CTA = (FONT_GAME_MENU_DISPLAY, 16, "bold")
FONT_GAME_MENU_LIST_DESC = (FF, 10)
# Логотип над подписью «Golden Section» («Данные/лого_меню_golden.png»)
GAME_MENU_LOGO_MAX_PX = 140
FONT_SM = (FF, 9)
FONT_BASE = (FF, 10)
FONT_MD = (FF, 11)
FONT_TITLE = (FF, 12, "bold")
FONT_HEAD = (FF, 14, "bold")
FONT_BANNER = (FONT_UI_DISPLAY, 20)
FONT_CAPTION = (FF, 8)
FONT_LIST_ROW = (FF, 11)
# Заголовок левой колонки («Меню»)
FONT_SIDEBAR_SECTION = (FONT_UI_DISPLAY, 17)
FONT_MONO = ("Consolas", 10)
FONT_MONO_LG = ("Consolas", 12)
FONT_MONO_XL = ("Consolas", 20)

# —— Отступы (хаб + карточка утилиты) ——
PAD_HUB_CARD = (11, 9)
PAD_UTIL_SHELL_OUTLINE = 1  # тонкая рамка «стекла» утилиты
PAD_UTIL_INNER_X = 18
PAD_UTIL_INNER_Y = 18
PAD_UTIL_SHELL_BOTTOM = (0, 4)  # pady снизу у рамки утилиты
GAP_SECTION = 12  # после заголовка секции

SECONDARY_BTN_BG = "#243449"
SECONDARY_BTN_ACTIVE = "#2d4058"
SECONDARY_BTN_FG = TEXT


def apply_sidebar_scrollbar(style: ttk.Style) -> None:
    """ttk.Scrollbar под тёмное меню (без «белого» классического Scrollbar Windows)."""
    _bootstrap_hub_ttk_theme(style)
    nm = "Hub.Sidebar.Vertical.TScrollbar"
    try:
        style.configure(
            nm,
            troughcolor=SIDEBAR_SCROLL_TROUGH,
            background=SIDEBAR_SCROLL_THUMB,
            borderwidth=0,
            relief="flat",
            arrowsize=13,
            width=13,
        )
        style.map(
            nm,
            background=[
                ("active", SIDEBAR_SCROLL_THUMB_ACTIVE),
                ("pressed", SIDEBAR_SCROLL_THUMB_ACTIVE),
                ("disabled", SIDEBAR_SCROLL_TROUGH),
            ],
            troughcolor=[
                ("!disabled", SIDEBAR_SCROLL_TROUGH),
            ],
            arrowcolor=[("disabled", SIDEBAR_MUTED), ("!disabled", SIDEBAR_MUTED)],
        )
    except tk.TclError:
        pass


def apply_hub_sidebar_tree(style: ttk.Style) -> None:
    """Дерево меню утилит: ровные колонки иконка + название, крупный межстрочный интервал."""
    nm = "Hub.Sidebar.Treeview"
    _bootstrap_hub_ttk_theme(style)
    try:
        style.configure(
            nm,
            background=SIDEBAR_LIST_INSET,
            fieldbackground=SIDEBAR_LIST_INSET,
            bordercolor=SIDEBAR_LIST_INSET,
            foreground=SIDEBAR_TEXT,
            borderwidth=0,
            relief="flat",
            rowheight=36,
            font=FONT_LIST_ROW,
        )
        style.map(
            nm,
            background=[("selected", SIDEBAR_SELECT_BG)],
            foreground=[("selected", SIDEBAR_SELECT_FG)],
        )
    except tk.TclError:
        pass


def apply_hub_ttk(style: ttk.Style, *, card_bg: str | None = None) -> None:
    """Базовые стили ttk для карточки утилиты; card_bg — фон родителя (часто CARD_ALT)."""
    _bootstrap_hub_ttk_theme(style)

    cb = card_bg or CARD_ALT

    style.configure("TFrame", background=cb)
    style.configure("TLabel", background=cb, foreground=TEXT, font=FONT_BASE)
    try:
        style.configure(
            "TButton",
            padding=(12, 8),
            font=FONT_BASE,
            foreground=TEXT,
            background=SECONDARY_BTN_BG,
            borderwidth=1,
            relief="flat",
            focusthickness=1,
            focuscolor=ACCENT,
        )
        style.map(
            "TButton",
            foreground=[("disabled", TEXT_DIM), ("active", TEXT), ("!disabled", TEXT)],
            background=[
                ("disabled", BORDER),
                ("pressed", BORDER_STRONG),
                ("active", SECONDARY_BTN_ACTIVE),
                ("!disabled", SECONDARY_BTN_BG),
            ],
        )
    except tk.TclError:
        style.configure("TButton", padding=(12, 8), font=FONT_BASE)
        style.map("TButton", foreground=[("disabled", TEXT_DIM)])

    style.configure(
        "Accent.TButton",
        padding=(14, 9),
        font=(FF, 10, "bold"),
        foreground=ACCENT_FG,
        background=ACCENT,
        borderwidth=0,
    )
    style.map(
        "Accent.TButton",
        foreground=[("disabled", "#94a3b8")],
        background=[("active", ACCENT_HOVER), ("pressed", ACCENT_DIM), ("disabled", BORDER_STRONG)],
    )

    try:
        style.configure(
            "Secondary.TButton",
            padding=(12, 8),
            font=FONT_BASE,
            foreground=SECONDARY_BTN_FG,
            background=SECONDARY_BTN_BG,
            borderwidth=1,
            relief="flat",
            focusthickness=1,
            focuscolor=ACCENT,
        )
        style.map(
            "Secondary.TButton",
            foreground=[("disabled", TEXT_DIM), ("active", TEXT), ("!disabled", TEXT)],
            background=[
                ("disabled", BORDER),
                ("pressed", BORDER_STRONG),
                ("active", SECONDARY_BTN_ACTIVE),
                ("!disabled", SECONDARY_BTN_BG),
            ],
        )
    except tk.TclError:
        pass

    try:
        style.configure(
            "Success.TButton",
            padding=(14, 9),
            font=(FF, 10, "bold"),
            foreground=SUCCESS_FG,
            background=SUCCESS,
            borderwidth=0,
        )
        style.map(
            "Success.TButton",
            foreground=[("disabled", "#94a3b8")],
            background=[("active", "#0f766e"), ("pressed", "#0d9488"), ("disabled", BORDER_STRONG)],
        )
    except tk.TclError:
        pass

    # Заголовок на белой поверхности CARD (внутри оболочки утилиты)
    style.configure(
        "CardTitle.TLabel",
        font=FONT_HEAD,
        foreground=TEXT,
        background=CARD,
    )
    style.configure(
        "MutedCard.TLabel",
        font=FONT_SM,
        foreground=TEXT_DIM,
        background=CARD,
    )

    style.configure("TLabelFrame", background=cb, labelanchor="nw")
    style.configure("TLabelframe.Label", font=(FF, 9, "bold"), background=cb, foreground=TEXT_DIM)

    style.configure(
        "Treeview",
        rowheight=30,
        font=FONT_BASE,
        fieldbackground=CARD,
        background=CARD,
        foreground=TEXT,
    )
    style.configure(
        "Treeview.Heading",
        font=(FF, 10, "bold"),
        foreground=TEXT,
        background=TREE_HEAD_BG,
        relief="flat",
        padding=(10, 8),
    )
    style.map(
        "Treeview.Heading",
        background=[("active", BORDER_STRONG)],
    )
    style.map("Treeview", background=[("selected", ACCENT)], foreground=[("selected", ACCENT_FG)])

    style.configure("TNotebook", background=cb, borderwidth=0)
    style.configure("TNotebook.Tab", padding=(16, 10), font=FONT_BASE)
    style.map(
        "TNotebook.Tab",
        background=[("selected", CARD), ("!selected", cb)],
        foreground=[("selected", TEXT), ("!selected", TEXT_DIM)],
        padding=[("selected", (16, 12)), ("!selected", (16, 10))],
    )

    style.configure("TPanedwindow", background=cb)

    style.configure(
        "TSeparator",
        background=BORDER if cb == CARD_ALT else BORDER_STRONG,
    )

    for sb in ("Vertical.TScrollbar", "Horizontal.TScrollbar"):
        try:
            style.configure(sb, troughcolor=CARD_ALT, background=BORDER_STRONG)
            style.map(
                sb,
                background=[("active", BORDER), ("pressed", BORDER_STRONG)],
                arrowcolor=[("disabled", TEXT_DIM), ("!disabled", SIDEBAR_MUTED)],
            )
        except tk.TclError:
            pass

    try:
        style.configure(
            "TEntry",
            fieldbackground=TEXT_FIELD_BG,
            foreground=TEXT,
            insertcolor=TEXT,
            padding=(10, 8),
            font=FONT_BASE,
        )
        style.map(
            "TEntry",
            fieldbackground=[("readonly", TEXT_FIELD_BG), ("disabled", SURFACE_SOFT)],
            foreground=[("disabled", TEXT_DIM)],
        )
    except tk.TclError:
        pass

    try:
        style.configure(
            "TCombobox",
            fieldbackground=TEXT_FIELD_BG,
            foreground=TEXT,
            padding=(8, 8),
            font=FONT_BASE,
            arrowsize=14,
        )
        style.map(
            "TCombobox",
            fieldbackground=[("readonly", TEXT_FIELD_BG), ("disabled", TEXT_FIELD_BG)],
            foreground=[("disabled", TEXT_DIM)],
        )
    except tk.TclError:
        pass

    try:
        style.configure(
            "Hub.Horizontal.TProgressbar",
            troughcolor=PROGRESS_TROUGH,
            background=ACCENT,
            thickness=10,
        )
    except tk.TclError:
        style.configure("Hub.Horizontal.TProgressbar", thickness=10)

    style.configure("Dim.TLabel", foreground=TEXT_DIM, font=FONT_SM, background=cb)

    try:
        style.configure(
            "TCheckbutton",
            background=cb,
            foreground=TEXT,
            font=FONT_BASE,
            focusthickness=1,
            focuscolor=ACCENT,
        )
        style.map("TCheckbutton", background=[("active", cb)])
    except tk.TclError:
        pass

    try:
        style.configure(
            "TRadiobutton",
            background=cb,
            foreground=TEXT,
            font=FONT_BASE,
            focusthickness=1,
            focuscolor=ACCENT,
        )
        style.map("TRadiobutton", background=[("active", cb)])
    except tk.TclError:
        pass


def configure_results_tree_tags(tv: ttk.Treeview) -> None:
    """Теги дерева результатов: уровни (файл/марка) и зебра по позициям."""
    try:
        tv.tag_configure("depth0", background=TREE_GROUP_FILE_BG, foreground=TEXT)
        tv.tag_configure("depth1", background=TREE_GROUP_MARK_BG, foreground=TEXT)
        tv.tag_configure("z_even", background=TREE_STRIPE_A, foreground=TEXT)
        tv.tag_configure("z_odd", background=TREE_STRIPE_B, foreground=TEXT)
        tv.tag_configure("issue", background="#3d2228", foreground="#fca5a5")
        tv.tag_configure("warn", background="#3d3520", foreground="#fcd34d")
        tv.tag_configure("ok", background="")
        tv.tag_configure("total_row", background=TREE_TOTAL_BG, foreground=TEXT)
    except tk.TclError:
        return
    try:
        tv.tag_configure("depth0", font=(FF, 10, "bold"))
        tv.tag_configure("depth1", font=(FF, 10, "bold"))
        tv.tag_configure("total_row", font=(FF, 10, "bold"))
    except tk.TclError:
        pass
