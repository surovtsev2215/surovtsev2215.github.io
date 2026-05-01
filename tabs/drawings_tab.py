import tkinter as tk
from tkinter import ttk, filedialog
from core.theme import BG_COLOR, FG_COLOR, ACCENT_COLOR, INPUT_BG


def create_drawings_tab(parent, app):
    """Вкладка чертежей."""
    # Заголовок
    lbl_title = tk.Label(parent, text="PDF Чертежи",
                        font=("Arial", 16, "bold"),
                        bg=BG_COLOR, fg=FG_COLOR)
    lbl_title.pack(pady=20)
    
    # Кнопки управления
    btn_frame = tk.Frame(parent, bg=BG_COLOR)
    btn_frame.pack(pady=10)
    
    def refresh_drawings():
        """Обновить список чертежей."""
        pass
    
    def open_drawing():
        """Открыть чертеж."""
        pass
    
    def extract_dimensions():
        """Извлечь размеры из чертежа."""
        pass
    
    ttk.Button(btn_frame, text="Обновить список", command=refresh_drawings).pack(side='left', padx=5)
    ttk.Button(btn_frame, text="Открыть", command=open_drawing).pack(side='left', padx=5)
    ttk.Button(btn_frame, text="Извлечь размеры", command=extract_dimensions).pack(side='left', padx=5)
    
    # Список файлов
    list_frame = tk.Frame(parent, bg=BG_COLOR)
    list_frame.pack(fill='both', expand=True, padx=20, pady=10)
    
    # Treeview для списка файлов
    columns = ("name", "size", "date")
    drawings_tree = ttk.Treeview(list_frame, columns=columns, show='headings', height=10)
    drawings_tree.heading("name", text="Название")
    drawings_tree.heading("size", text="Размер")
    drawings_tree.heading("date", text="Дата")
    drawings_tree.column("name", width=300)
    drawings_tree.column("size", width=100)
    drawings_tree.column("date", width=150)
    drawings_tree.pack(side='left', fill='both', expand=True)
    
    # Скроллбар
    scrollbar = ttk.Scrollbar(list_frame, orient='vertical', command=drawings_tree.yview)
    scrollbar.pack(side='right', fill='y')
    drawings_tree.configure(yscrollcommand=scrollbar.set)
    
    # Превью
    preview_frame = tk.LabelFrame(parent, text="Предпросмотр", 
                                  bg=BG_COLOR, fg=FG_COLOR)
    preview_frame.pack(fill='both', expand=True, padx=20, pady=10)
    
    preview_text = tk.Text(preview_frame, height=8, bg=INPUT_BG, fg=FG_COLOR)
    preview_text.pack(fill='both', expand=True, padx=5, pady=5)
