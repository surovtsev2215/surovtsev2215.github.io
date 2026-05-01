import tkinter as tk
from tkinter import ttk
from core.theme import BG_COLOR, FG_COLOR, ACCENT_COLOR, INPUT_BG


def create_reports_tab(parent, app):
    """Вкладка отчетов."""
    # Заголовок
    lbl_title = tk.Label(parent, text="Создание отчетов",
                        font=("Arial", 16, "bold"),
                        bg=BG_COLOR, fg=FG_COLOR)
    lbl_title.pack(pady=20)
    
    # Выбор типа отчета
    type_frame = tk.Frame(parent, bg=BG_COLOR)
    type_frame.pack(pady=10)
    
    tk.Label(type_frame, text="Тип отчета:", 
            bg=BG_COLOR, fg=FG_COLOR).grid(row=0, column=0, padx=5, pady=5)
    report_type = ttk.Combobox(type_frame, 
                                values=["Общий отчет", "Спецификация", "Карта раскроя"],
                                width=20)
    report_type.current(0)
    report_type.grid(row=0, column=1, padx=5, pady=5)
    
    # Кнопки
    btn_frame = tk.Frame(parent, bg=BG_COLOR)
    btn_frame.pack(pady=15)
    
    def create_report():
        """Создать отчет."""
        pass
    
    ttk.Button(btn_frame, text="Создать отчет", command=create_report).pack(padx=5)
    
    # Прогресс-бар
    progress_frame = tk.Frame(parent, bg=BG_COLOR)
    progress_frame.pack(pady=20, fill='x', padx=50)
    
    progress = ttk.Progressbar(progress_frame, mode='determinate', length=400)
    progress.pack()
    
    # История отчетов
    history_frame = tk.LabelFrame(parent, text="Последние отчеты", 
                                  bg=BG_COLOR, fg=FG_COLOR)
    history_frame.pack(fill='both', expand=True, padx=20, pady=10)
    
    history_list = tk.Listbox(history_frame, bg=INPUT_BG, fg=FG_COLOR, height=8)
    history_list.pack(fill='both', expand=True, padx=5, pady=5)
