import tkinter as tk
from tkinter import ttk
from core.theme import BG_COLOR, FG_COLOR, ACCENT_COLOR, INPUT_BG
from tabs.calculator_tab import create_calculator_tab
from tabs.drawings_tab import create_drawings_tab
from tabs.reports_tab import create_reports_tab
from tabs.settings_tab import create_settings_tab


class MainWindow:
    """Главное окно приложения ПТО."""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("ПТО Калькулятор")
        self.root.geometry("800x600")
        self.root.configure(bg=BG_COLOR)
        
        # Настройки темной темы
        self.bg_color = BG_COLOR
        self.fg_color = FG_COLOR
        self.accent_color = ACCENT_COLOR
        self.input_bg = INPUT_BG
        
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
        create_calculator_tab(self.tab_calc, self)
        create_drawings_tab(self.tab_drawings, self)
        create_reports_tab(self.tab_reports, self)
        create_settings_tab(self.tab_settings, self)
        
        # Статус-бар
        self.create_status_bar()
    
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
    
    def mainloop(self):
        """Запуск главного цикла."""
        self.root.mainloop()
