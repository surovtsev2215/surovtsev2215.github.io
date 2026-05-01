import tkinter as tk
from tkinter import ttk, filedialog
from core.theme import BG_COLOR, FG_COLOR, ACCENT_COLOR, INPUT_BG


def create_settings_tab(parent, app):
    """Вкладка настроек."""
    # Заголовок
    lbl_title = tk.Label(parent, text="Настройки",
                        font=("Arial", 16, "bold"),
                        bg=BG_COLOR, fg=FG_COLOR)
    lbl_title.pack(pady=20)
    
    # Папки
    folders_frame = tk.LabelFrame(parent, text="Папки", 
                                  bg=BG_COLOR, fg=FG_COLOR)
    folders_frame.pack(fill='x', padx=20, pady=10)
    
    # Папка чертежей
    folder_draw_frame = tk.Frame(folders_frame, bg=BG_COLOR)
    folder_draw_frame.pack(fill='x', padx=10, pady=5)
    tk.Label(folder_draw_frame, text="Чертежи:", 
            bg=BG_COLOR, fg=FG_COLOR, width=15, anchor='e').pack(side='left')
    drawings_folder_var = tk.StringVar(value="C:/PTO/drawings")
    tk.Entry(folder_draw_frame, textvariable=drawings_folder_var, 
            bg=INPUT_BG, fg=FG_COLOR, width=40).pack(side='left', padx=5)
    
    def browse_drawings():
        folder = filedialog.askdirectory()
        if folder:
            drawings_folder_var.set(folder)
    
    ttk.Button(folder_draw_frame, text="...", width=3, 
              command=browse_drawings).pack(side='left')
    
    # Папка отчетов
    folder_rep_frame = tk.Frame(folders_frame, bg=BG_COLOR)
    folder_rep_frame.pack(fill='x', padx=10, pady=5)
    tk.Label(folder_rep_frame, text="Отчеты:", 
            bg=BG_COLOR, fg=FG_COLOR, width=15, anchor='e').pack(side='left')
    reports_folder_var = tk.StringVar(value="C:/PTO/reports")
    tk.Entry(folder_rep_frame, textvariable=reports_folder_var, 
            bg=INPUT_BG, fg=FG_COLOR, width=40).pack(side='left', padx=5)
    
    def browse_reports():
        folder = filedialog.askdirectory()
        if folder:
            reports_folder_var.set(folder)
    
    ttk.Button(folder_rep_frame, text="...", width=3, 
              command=browse_reports).pack(side='left')
    
    # Материалы
    materials_frame = tk.LabelFrame(parent, text="Материалы", 
                                    bg=BG_COLOR, fg=FG_COLOR)
    materials_frame.pack(fill='x', padx=20, pady=10)
    
    mat_frame = tk.Frame(materials_frame, bg=BG_COLOR)
    mat_frame.pack(fill='x', padx=10, pady=5)
    tk.Label(mat_frame, text="Плотность стали (кг/м³):", 
            bg=BG_COLOR, fg=FG_COLOR).pack(side='left')
    density_var = tk.StringVar(value="7850")
    tk.Entry(mat_frame, textvariable=density_var, 
            bg=INPUT_BG, fg=FG_COLOR, width=15).pack(side='left', padx=5)
    
    # Экспорт
    export_frame = tk.LabelFrame(parent, text="Форматы экспорта", 
                                 bg=BG_COLOR, fg=FG_COLOR)
    export_frame.pack(fill='x', padx=20, pady=10)
    
    xlsx_var = tk.BooleanVar(value=True)
    tk.Checkbutton(export_frame, text="Excel (.xlsx)", variable=xlsx_var,
                  bg=BG_COLOR, fg=FG_COLOR, selectcolor=INPUT_BG).pack(anchor='w', padx=10, pady=5)
    
    csv_var = tk.BooleanVar(value=False)
    tk.Checkbutton(export_frame, text="CSV (.csv)", variable=csv_var,
                  bg=BG_COLOR, fg=FG_COLOR, selectcolor=INPUT_BG).pack(anchor='w', padx=10, pady=5)
    
    pdf_var = tk.BooleanVar(value=False)
    tk.Checkbutton(export_frame, text="PDF (.pdf)", variable=pdf_var,
                  bg=BG_COLOR, fg=FG_COLOR, selectcolor=INPUT_BG).pack(anchor='w', padx=10, pady=5)
    
    # Кнопка сохранения
    def save_settings():
        """Сохранить настройки."""
        pass
    
    ttk.Button(parent, text="Сохранить настройки", 
              command=save_settings).pack(pady=20)
