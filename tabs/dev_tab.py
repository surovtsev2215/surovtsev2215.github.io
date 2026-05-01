import tkinter as tk
from tkinter import ttk
from core.theme import BG_COLOR, FG_COLOR, ACCENT_COLOR, INPUT_BG


def create_dev_tab(parent, app):
    """Вкладка разработчика (заглушка)."""
    lbl_title = tk.Label(parent, text="Разработка",
                        font=("Arial", 16, "bold"),
                        bg=BG_COLOR, fg=FG_COLOR)
    lbl_title.pack(pady=20)
    
    tk.Label(parent, text="В разработке...",
            bg=BG_COLOR, fg=FG_COLOR).pack(pady=10)
