import tkinter as tk
from tkinter import ttk
from core.theme import BG_COLOR, FG_COLOR, ACCENT_COLOR, INPUT_BG


def create_calculator_tab(parent, app):
    """Вкладка расчета металла."""
    # Заголовок
    lbl_title = tk.Label(parent, text="Расчет металлопроката",
                        font=("Arial", 16, "bold"),
                        bg=BG_COLOR, fg=FG_COLOR)
    lbl_title.pack(pady=20)
    
    # Фрейм для ввода данных
    input_frame = tk.Frame(parent, bg=BG_COLOR)
    input_frame.pack(pady=10)
    
    # Тип профиля
    tk.Label(input_frame, text="Тип профиля:", 
            bg=BG_COLOR, fg=FG_COLOR).grid(row=0, column=0, padx=5, pady=5, sticky='e')
    profile_type = ttk.Combobox(input_frame, 
                                 values=["лист", "швеллер", "уголок", "двутавр", "труба"],
                                 width=20)
    profile_type.grid(row=0, column=1, padx=5, pady=5)
    
    # Размер
    tk.Label(input_frame, text="Размер (мм):", 
            bg=BG_COLOR, fg=FG_COLOR).grid(row=1, column=0, padx=5, pady=5, sticky='e')
    dimension_entry = ttk.Entry(input_frame, width=22)
    dimension_entry.grid(row=1, column=1, padx=5, pady=5)
    
    # Толщина
    tk.Label(input_frame, text="Толщина (мм):", 
            bg=BG_COLOR, fg=FG_COLOR).grid(row=2, column=0, padx=5, pady=5, sticky='e')
    thickness_entry = ttk.Entry(input_frame, width=22)
    thickness_entry.grid(row=2, column=1, padx=5, pady=5)
    
    # Длина
    tk.Label(input_frame, text="Длина (м):", 
            bg=BG_COLOR, fg=FG_COLOR).grid(row=3, column=0, padx=5, pady=5, sticky='e')
    length_entry = ttk.Entry(input_frame, width=22)
    length_entry.grid(row=3, column=1, padx=5, pady=5)
    
    # Материал
    tk.Label(input_frame, text="Материал:", 
            bg=BG_COLOR, fg=FG_COLOR).grid(row=4, column=0, padx=5, pady=5, sticky='e')
    material = ttk.Combobox(input_frame, 
                             values=["сталь", "алюминий", "медь", "латунь", "нержавейка"],
                             width=20)
    material.current(0)
    material.grid(row=4, column=1, padx=5, pady=5)
    
    # Кнопка расчета
    def calculate():
        """Расчет металла."""
        pass
    
    btn_calc = ttk.Button(parent, text="Рассчитать", command=calculate)
    btn_calc.pack(pady=15)
    
    # Результаты
    result_frame = tk.Frame(parent, bg=BG_COLOR)
    result_frame.pack(pady=10)
    
    tk.Label(result_frame, text="Масса:", 
            bg=BG_COLOR, fg=FG_COLOR, font=("Arial", 12)).grid(row=0, column=0, padx=5, pady=5)
    mass_result = tk.Label(result_frame, text="0 кг", 
                            bg=BG_COLOR, fg=ACCENT_COLOR, font=("Arial", 12, "bold"))
    mass_result.grid(row=0, column=1, padx=5, pady=5)
    
    tk.Label(result_frame, text="Площадь окраски:", 
            bg=BG_COLOR, fg=FG_COLOR, font=("Arial", 12)).grid(row=1, column=0, padx=5, pady=5)
    area_result = tk.Label(result_frame, text="0 м²", 
                            bg=BG_COLOR, fg=ACCENT_COLOR, font=("Arial", 12, "bold"))
    area_result.grid(row=1, column=1, padx=5, pady=5)
