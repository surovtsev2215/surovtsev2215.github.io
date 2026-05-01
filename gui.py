# GUI для приложения ПТО
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import os
from datetime import datetime


class PTOApp:
    """Главное окно приложения ПТО."""
    
    def __init__(self, root):
        self.root = root
        self.root.title("ПТО Калькулятор")
        self.root.geometry("800x600")
        
        # Настройки темной темы
        self.bg_color = "#2b2b2b"
        self.fg_color = "#ffffff"
        self.accent_color = "#4a90d9"
        self.input_bg = "#3c3c3c"
        self.root.configure(bg=self.bg_color)
        
        # Конфигурация стилей
        self.setup_styles()
        
        # Создание интерфейса
        self.create_widgets()
        
        # Статус
        self.status_text = "Готов"
        self.update_status()
    
    def setup_styles(self):
        """Настройка стилей для темной темы."""
        style = ttk.Style()
        style.theme_use('clam')
        
        # Стиль для Notebook (вкладок)
        style.configure('TNotebook', background=self.bg_color)
        style.configure('TNotebook.Tab', 
                       background=self.input_bg, 
                       foreground=self.fg_color,
                       padding=[10, 5])
        style.map('TNotebook.Tab', 
                 background=[('selected', self.accent_color)],
                 foreground=[('selected', self.fg_color)])
        
        # Стиль для Frame
        style.configure('TFrame', background=self.bg_color)
        
        # Стиль для Label
        style.configure('TLabel', 
                       background=self.bg_color, 
                       foreground=self.fg_color)
        
        # Стиль для Button
        style.configure('TButton', 
                       background=self.accent_color,
                       foreground=self.fg_color,
                       borderwidth=0,
                       padding=[10, 5])
        style.map('TButton', 
                 background=[('active', '#5a9fe0')])
        
        # Стиль для Entry
        style.configure('TEntry', 
                       fieldbackground=self.input_bg,
                       foreground=self.fg_color)
        
        # Стиль для Treeview
        style.configure('Treeview', 
                       background=self.input_bg,
                       foreground=self.fg_color,
                       fieldbackground=self.input_bg)
        style.configure('Treeview.Heading',
                       background=self.accent_color,
                       foreground=self.fg_color)
        
        # Стиль для Progressbar
        style.configure('Horizontal.TProgressbar',
                       background=self.accent_color,
                       troughcolor=self.input_bg)
    
    def create_widgets(self):
        """Создание всех виджетов."""
        # Создаем Notebook для вкладок
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill='both', expand=True, padx=10, pady=10)
        
        # Создаем вкладки
        self.tab_calc = ttk.Frame(self.notebook)
        self.tab_drawings = ttk.Frame(self.notebook)
        self.tab_reports = ttk.Frame(self.notebook)
        self.tab_settings = ttk.Frame(self.notebook)
        
        self.notebook.add(self.tab_calc, text="Расчет металла")
        self.notebook.add(self.tab_drawings, text="Чертежи")
        self.notebook.add(self.tab_reports, text="Отчеты")
        self.notebook.add(self.tab_settings, text="Настройки")
        
        # Заполняем каждую вкладку
        self.create_calc_tab()
        self.create_drawings_tab()
        self.create_reports_tab()
        self.create_settings_tab()
        
        # Статус-бар
        self.create_status_bar()
    
    def create_calc_tab(self):
        """Вкладка расчета металла."""
        # Заголовок
        lbl_title = tk.Label(self.tab_calc, text="Расчет металлопроката",
                            font=("Arial", 16, "bold"),
                            bg=self.bg_color, fg=self.fg_color)
        lbl_title.pack(pady=20)
        
        # Фрейм для ввода данных
        input_frame = tk.Frame(self.tab_calc, bg=self.bg_color)
        input_frame.pack(pady=10)
        
        # Тип профиля
        tk.Label(input_frame, text="Тип профиля:", 
                bg=self.bg_color, fg=self.fg_color).grid(row=0, column=0, padx=5, pady=5, sticky='e')
        self.profile_type = ttk.Combobox(input_frame, 
                                         values=["лист", "швеллер", "уголок", "двутавр", "труба"],
                                         width=20)
        self.profile_type.grid(row=0, column=1, padx=5, pady=5)
        
        # Размер
        tk.Label(input_frame, text="Размер (мм):", 
                bg=self.bg_color, fg=self.fg_color).grid(row=1, column=0, padx=5, pady=5, sticky='e')
        self.dimension_entry = ttk.Entry(input_frame, width=22)
        self.dimension_entry.grid(row=1, column=1, padx=5, pady=5)
        
        # Толщина
        tk.Label(input_frame, text="Толщина (мм):", 
                bg=self.bg_color, fg=self.fg_color).grid(row=2, column=0, padx=5, pady=5, sticky='e')
        self.thickness_entry = ttk.Entry(input_frame, width=22)
        self.thickness_entry.grid(row=2, column=1, padx=5, pady=5)
        
        # Длина
        tk.Label(input_frame, text="Длина (м):", 
                bg=self.bg_color, fg=self.fg_color).grid(row=3, column=0, padx=5, pady=5, sticky='e')
        self.length_entry = ttk.Entry(input_frame, width=22)
        self.length_entry.grid(row=3, column=1, padx=5, pady=5)
        
        # Материал
        tk.Label(input_frame, text="Материал:", 
                bg=self.bg_color, fg=self.fg_color).grid(row=4, column=0, padx=5, pady=5, sticky='e')
        self.material = ttk.Combobox(input_frame, 
                                     values=["сталь", "алюминий", "медь", "латунь", "нержавейка"],
                                     width=20)
        self.material.current(0)
        self.material.grid(row=4, column=1, padx=5, pady=5)
        
        # Кнопка расчета
        btn_calc = ttk.Button(self.tab_calc, text="Рассчитать", command=self.calculate)
        btn_calc.pack(pady=15)
        
        # Результаты
        result_frame = tk.Frame(self.tab_calc, bg=self.bg_color)
        result_frame.pack(pady=10)
        
        tk.Label(result_frame, text="Масса:", 
                bg=self.bg_color, fg=self.fg_color, font=("Arial", 12)).grid(row=0, column=0, padx=5, pady=5)
        self.mass_result = tk.Label(result_frame, text="0 кг", 
                                    bg=self.bg_color, fg=self.accent_color, font=("Arial", 12, "bold"))
        self.mass_result.grid(row=0, column=1, padx=5, pady=5)
        
        tk.Label(result_frame, text="Площадь окраски:", 
                bg=self.bg_color, fg=self.fg_color, font=("Arial", 12)).grid(row=1, column=0, padx=5, pady=5)
        self.area_result = tk.Label(result_frame, text="0 м²", 
                                    bg=self.bg_color, fg=self.accent_color, font=("Arial", 12, "bold"))
        self.area_result.grid(row=1, column=1, padx=5, pady=5)
    
    def create_drawings_tab(self):
        """Вкладка чертежей."""
        # Заголовок
        lbl_title = tk.Label(self.tab_drawings, text="PDF Чертежи",
                            font=("Arial", 16, "bold"),
                            bg=self.bg_color, fg=self.fg_color)
        lbl_title.pack(pady=20)
        
        # Кнопки управления
        btn_frame = tk.Frame(self.tab_drawings, bg=self.bg_color)
        btn_frame.pack(pady=10)
        
        ttk.Button(btn_frame, text="Обновить список", command=self.refresh_drawings).pack(side='left', padx=5)
        ttk.Button(btn_frame, text="Открыть", command=self.open_drawing).pack(side='left', padx=5)
        ttk.Button(btn_frame, text="Извлечь размеры", command=self.extract_dimensions).pack(side='left', padx=5)
        
        # Список файлов
        list_frame = tk.Frame(self.tab_drawings, bg=self.bg_color)
        list_frame.pack(fill='both', expand=True, padx=20, pady=10)
        
        # Treeview для списка файлов
        columns = ("name", "size", "date")
        self.drawings_tree = ttk.Treeview(list_frame, columns=columns, show='headings', height=10)
        self.drawings_tree.heading("name", text="Название")
        self.drawings_tree.heading("size", text="Размер")
        self.drawings_tree.heading("date", text="Дата")
        self.drawings_tree.column("name", width=300)
        self.drawings_tree.column("size", width=100)
        self.drawings_tree.column("date", width=150)
        self.drawings_tree.pack(side='left', fill='both', expand=True)
        
        # Скроллбар
        scrollbar = ttk.Scrollbar(list_frame, orient='vertical', command=self.drawings_tree.yview)
        scrollbar.pack(side='right', fill='y')
        self.drawings_tree.configure(yscrollcommand=scrollbar.set)
        
        # Превью
        preview_frame = tk.LabelFrame(self.tab_drawings, text="Предпросмотр", 
                                      bg=self.bg_color, fg=self.fg_color)
        preview_frame.pack(fill='both', expand=True, padx=20, pady=10)
        
        self.preview_text = tk.Text(preview_frame, height=8, bg=self.input_bg, fg=self.fg_color)
        self.preview_text.pack(fill='both', expand=True, padx=5, pady=5)
    
    def create_reports_tab(self):
        """Вкладка отчетов."""
        # Заголовок
        lbl_title = tk.Label(self.tab_reports, text="Создание отчетов",
                            font=("Arial", 16, "bold"),
                            bg=self.bg_color, fg=self.fg_color)
        lbl_title.pack(pady=20)
        
        # Выбор типа отчета
        type_frame = tk.Frame(self.tab_reports, bg=self.bg_color)
        type_frame.pack(pady=10)
        
        tk.Label(type_frame, text="Тип отчета:", 
                bg=self.bg_color, fg=self.fg_color).grid(row=0, column=0, padx=5, pady=5)
        self.report_type = ttk.Combobox(type_frame, 
                                        values=["Общий отчет", "Спецификация", "Карта раскроя"],
                                        width=20)
        self.report_type.current(0)
        self.report_type.grid(row=0, column=1, padx=5, pady=5)
        
        # Кнопки
        btn_frame = tk.Frame(self.tab_reports, bg=self.bg_color)
        btn_frame.pack(pady=15)
        
        ttk.Button(btn_frame, text="Создать отчет", command=self.create_report).pack(padx=5)
        
        # Прогресс-бар
        progress_frame = tk.Frame(self.tab_reports, bg=self.bg_color)
        progress_frame.pack(pady=20, fill='x', padx=50)
        
        self.progress = ttk.Progressbar(progress_frame, mode='determinate', length=400)
        self.progress.pack()
        
        # История отчетов
        history_frame = tk.LabelFrame(self.tab_reports, text="Последние отчеты", 
                                      bg=self.bg_color, fg=self.fg_color)
        history_frame.pack(fill='both', expand=True, padx=20, pady=10)
        
        self.history_list = tk.Listbox(history_frame, bg=self.input_bg, fg=self.fg_color, height=8)
        self.history_list.pack(fill='both', expand=True, padx=5, pady=5)
    
    def create_settings_tab(self):
        """Вкладка настроек."""
        # Заголовок
        lbl_title = tk.Label(self.tab_settings, text="Настройки",
                            font=("Arial", 16, "bold"),
                            bg=self.bg_color, fg=self.fg_color)
        lbl_title.pack(pady=20)
        
        # Папки
        folders_frame = tk.LabelFrame(self.tab_settings, text="Папки", 
                                      bg=self.bg_color, fg=self.fg_color)
        folders_frame.pack(fill='x', padx=20, pady=10)
        
        # Папка чертежей
        folder_draw_frame = tk.Frame(folders_frame, bg=self.bg_color)
        folder_draw_frame.pack(fill='x', padx=10, pady=5)
        tk.Label(folder_draw_frame, text="Чертежи:", 
                bg=self.bg_color, fg=self.fg_color, width=15, anchor='e').pack(side='left')
        self.drawings_folder_var = tk.StringVar(value="C:/PTO/drawings")
        tk.Entry(folder_draw_frame, textvariable=self.drawings_folder_var, 
                bg=self.input_bg, fg=self.fg_color, width=40).pack(side='left', padx=5)
        ttk.Button(folder_draw_frame, text="...", width=3, 
                  command=lambda: self.browse_folder(self.drawings_folder_var)).pack(side='left')
        
        # Папка отчетов
        folder_rep_frame = tk.Frame(folders_frame, bg=self.bg_color)
        folder_rep_frame.pack(fill='x', padx=10, pady=5)
        tk.Label(folder_rep_frame, text="Отчеты:", 
                bg=self.bg_color, fg=self.fg_color, width=15, anchor='e').pack(side='left')
        self.reports_folder_var = tk.StringVar(value="C:/PTO/reports")
        tk.Entry(folder_rep_frame, textvariable=self.reports_folder_var, 
                bg=self.input_bg, fg=self.fg_color, width=40).pack(side='left', padx=5)
        ttk.Button(folder_rep_frame, text="...", width=3, 
                  command=lambda: self.browse_folder(self.reports_folder_var)).pack(side='left')
        
        # Материалы
        materials_frame = tk.LabelFrame(self.tab_settings, text="Материалы", 
                                        bg=self.bg_color, fg=self.fg_color)
        materials_frame.pack(fill='x', padx=20, pady=10)
        
        mat_frame = tk.Frame(materials_frame, bg=self.bg_color)
        mat_frame.pack(fill='x', padx=10, pady=5)
        tk.Label(mat_frame, text="Плотность стали (кг/м³):", 
                bg=self.bg_color, fg=self.fg_color).pack(side='left')
        self.density_var = tk.StringVar(value="7850")
        tk.Entry(mat_frame, textvariable=self.density_var, 
                bg=self.input_bg, fg=self.fg_color, width=15).pack(side='left', padx=5)
        
        # Экспорт
        export_frame = tk.LabelFrame(self.tab_settings, text="Форматы экспорта", 
                                     bg=self.bg_color, fg=self.fg_color)
        export_frame.pack(fill='x', padx=20, pady=10)
        
        self.xlsx_var = tk.BooleanVar(value=True)
        tk.Checkbutton(export_frame, text="Excel (.xlsx)", variable=self.xlsx_var,
                      bg=self.bg_color, fg=self.fg_color, selectcolor=self.input_bg).pack(anchor='w', padx=10, pady=5)
        
        self.csv_var = tk.BooleanVar(value=False)
        tk.Checkbutton(export_frame, text="CSV (.csv)", variable=self.csv_var,
                      bg=self.bg_color, fg=self.fg_color, selectcolor=self.input_bg).pack(anchor='w', padx=10, pady=5)
        
        self.pdf_var = tk.BooleanVar(value=False)
        tk.Checkbutton(export_frame, text="PDF (.pdf)", variable=self.pdf_var,
                      bg=self.bg_color, fg=self.fg_color, selectcolor=self.input_bg).pack(anchor='w', padx=10, pady=5)
        
        # Кнопка сохранения
        ttk.Button(self.tab_settings, text="Сохранить настройки", 
                  command=self.save_settings).pack(pady=20)
    
    def create_status_bar(self):
        """Создание статус-бара."""
        status_frame = tk.Frame(self.root, bg=self.accent_color, relief='sunken')
        status_frame.pack(side='bottom', fill='x')
        
        self.status_label = tk.Label(status_frame, text="", 
                                     bg=self.accent_color, fg=self.fg_color)
        self.status_label.pack(side='left', padx=5)
        
        version_label = tk.Label(status_frame, text="v1.0.0", 
                                bg=self.accent_color, fg=self.fg_color)
        version_label.pack(side='right', padx=5)
    
    def update_status(self, text=None):
        """Обновление статус-бара."""
        if text:
            self.status_text = text
        self.status_label.config(text=self.status_text)
    
    # Заглушки функций
    
    def calculate(self):
        """Расчет металла."""
        pass
    
    def refresh_drawings(self):
        """Обновить список чертежей."""
        pass
    
    def open_drawing(self):
        """Открыть чертеж."""
        pass
    
    def extract_dimensions(self):
        """Извлечь размеры из чертежа."""
        pass
    
    def create_report(self):
        """Создать отчет."""
        pass
    
    def browse_folder(self, var):
        """Выбор папки."""
        folder = filedialog.askdirectory()
        if folder:
            var.set(folder)
    
    def save_settings(self):
        """Сохранить настройки."""
        pass


def main():
    """Запуск приложения."""
    root = tk.Tk()
    app = PTOApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
