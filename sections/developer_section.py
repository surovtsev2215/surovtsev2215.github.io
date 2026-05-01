import tkinter as tk
from tkinter import ttk
import os
import subprocess
from core.theme import BG_COLOR, FG_COLOR, ACCENT_COLOR, INPUT_BG


def create_dev_tab(parent, app):
    """Вкладка разработчика (заглушка)."""
    
    # Фрейм для дерева
    tree_frame = tk.Frame(parent, bg=BG_COLOR)
    tree_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
    
    # Treeview для отображения структуры проекта
    tree = ttk.Treeview(tree_frame, show='tree')
    tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
    
    # Скроллбар
    scrollbar = ttk.Scrollbar(tree_frame, orient=tk.VERTICAL, command=tree.yview)
    scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    tree.configure(yscrollcommand=scrollbar.set)
    
    # Текстовое поле для описания файла
    desc_frame = tk.Frame(parent, bg=BG_COLOR)
    desc_frame.pack(fill=tk.X, padx=10, pady=5)
    
    tk.Label(desc_frame, text="Описание файла:", bg=BG_COLOR, fg=FG_COLOR, font=("Arial", 10, "bold")).pack(anchor=tk.W)
    
    text_desc = tk.Text(desc_frame, height=4, bg=INPUT_BG, fg=FG_COLOR, font=("Arial", 9))
    text_desc.pack(fill=tk.X, pady=5)
    
    # Кнопка обновления
    btn_frame = tk.Frame(parent, bg=BG_COLOR)
    btn_frame.pack(fill=tk.X, padx=10, pady=5)
    
    btn_refresh = tk.Button(btn_frame, text="🔄 Обновить дерево", bg=ACCENT_COLOR, fg="white",
                            command=lambda: refresh_tree(tree, "PTO_Project"))
    btn_refresh.pack(side=tk.RIGHT)
    
    def get_icon(filename):
        """Возвращает иконку в зависимости от типа файла."""
        if os.path.isdir(filename):
            return "📁"
        elif filename.endswith(".py"):
            return "🐍"
        elif filename.endswith(".txt"):
            return "📄"
        return "📄"
    
    def load_tree(parent_node, path):
        """Рекурсивно загружает структуру папки в дерево."""
        try:
            items = os.listdir(path)
            items.sort()
            for item in items:
                if item.startswith('.'):
                    continue
                full_path = os.path.join(path, item)
                icon = get_icon(full_path)
                node = tree.insert(parent_node, tk.END, text=f"{icon} {item}", values=[full_path])
                if os.path.isdir(full_path):
                    load_tree(node, full_path)
        except PermissionError:
            pass
    
    def refresh_tree(tree_widget, root_name):
        """Обновляет дерево."""
        # Очищаем дерево
        for item in tree_widget.get_children():
            tree_widget.delete(item)
        
        # Создаем корневой элемент
        root_path = os.getcwd()
        root_node = tree_widget.insert("", tk.END, text=f"📁 {root_name}", values=[root_path], open=True)
        
        # Загружаем содержимое
        load_tree(root_node, root_path)
    
    def get_file_description(filepath):
        """Читает первые 3 строки комментария из файла."""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = []
                for _ in range(3):
                    line = f.readline()
                    if not line:
                        break
                    lines.append(line.rstrip())
                return '\n'.join(lines) if lines else "Нет описания"
        except Exception as e:
            return f"Не удалось прочитать файл: {e}"
    
    def on_select(event):
        """Обрабатывает выбор элемента в дереве."""
        selected = tree.selection()
        if selected:
            item = tree.item(selected[0])
            path = item['values'][0]
            if os.path.isfile(path):
                description = get_file_description(path)
                text_desc.delete('1.0', tk.END)
                text_desc.insert('1.0', description)
            else:
                text_desc.delete('1.0', tk.END)
                text_desc.insert('1.0', "Папка")
    
    def on_double_click(event):
        """Обрабатывает двойной клик по элементу - открывает файл в редакторе."""
        selected = tree.selection()
        if selected:
            item = tree.item(selected[0])
            path = item['values'][0]
            if os.path.isfile(path):
                try:
                    # Открываем файл в системном редакторе по умолчанию
                    os.startfile(path) if os.name == 'nt' else subprocess.call(['xdg-open', path])
                except Exception as e:
                    text_desc.delete('1.0', tk.END)
                    text_desc.insert('1.0', f"Не удалось открыть файл: {e}")
    
    # Привязка событий
    tree.bind('<<TreeviewSelect>>', on_select)
    tree.bind('<Double-Button-1>', on_double_click)
    
    # Начальная загрузка дерева
    refresh_tree(tree, "PTO_Project")
