# Главный модуль приложения ПТО
import logging
import sys
from config import Config, setup_logging
from calculator import MetalCalculator
from pdf_reader import PDFReader
from excel_writer import ExcelWriter


def show_menu():
    """Отображение главного меню."""
    print("\n" + "=" * 50)
    print(f"  {Config.APP_NAME} v{Config.APP_VERSION}")
    print("=" * 50)
    print("  1. Расчет металла")
    print("  2. Чтение чертежей")
    print("  3. Создание отчета")
    print("  4. Настройки")
    print("  5. Выход")
    print("=" * 50)


def menu_calculator(calc):
    """Меню расчета металла."""
    while True:
        print("\n--- Расчет металла ---")
        print("1. Рассчитать вес профиля")
        print("2. Рассчитать раскрой листа")
        print("3. Рассчитать площадь окраски")
        print("4. Рассчитать стоимость")
        print("0. Назад")
        
        choice = input("Выберите пункт: ").strip()
        
        if choice == "1":
            calc_weight_menu(calc)
        elif choice == "2":
            calc_sheet_menu(calc)
        elif choice == "3":
            calc_paint_menu(calc)
        elif choice == "4":
            calc_cost_menu(calc)
        elif choice == "0":
            break
        else:
            print("Неверный выбор.")


def calc_weight_menu(calc):
    """Расчет веса металла."""
    print("\n--- Расчет веса профиля ---")
    
    try:
        print("Типы профилей: лист, швеллер, уголок, двутавр, труба")
        profile_type = input("Тип профиля: ").strip()
        
        dimensions = {}
        
        if profile_type.lower() == "лист":
            dimensions["width"] = float(input("Ширина листа (мм): "))
            dimensions["thickness"] = float(input("Толщина листа (мм): "))
        else:
            dimensions["size"] = input("Размер (номер/сечение): ").strip()
            dimensions["thickness"] = float(input("Толщина стенки (мм): ")) if "труба" in profile_type.lower() else 0
        
        dimensions["material"] = input("Материал (сталь/алюминий/медь): ").strip() or "сталь"
        length = float(input("Длина (м): "))
        
        weight = calc.calculate_weight(dimensions, profile_type, length)
        print(f"\n>>> Вес: {weight} кг")
        
    except ValueError as e:
        print(f"Ошибка ввода: {e}")
    except Exception as e:
        print(f"Ошибка расчета: {e}")


def calc_sheet_menu(calc):
    """Расчет раскроя листа."""
    print("\n--- Расчет раскроя ---")
    
    try:
        width = float(input("Ширина детали (мм): "))
        height = float(input("Высота детали (мм): "))
        sheet_width = float(input("Ширина листа (мм): "))
        sheet_height = float(input("Длина листа (мм): "))
        
        result = calc.calculate_sheet_count(width, height, sheet_width, sheet_height)
        
        print(f"\n>>> Результат раскроя:")
        print(f"    Деталей с листа: {result.get('деталей_с_листа', 0)}")
        print(f"    Использовано: {result.get('использовано_процентов', 0)}%")
        print(f"    Отходы: {result.get('отходы_процентов', 0)}%")
        
    except ValueError as e:
        print(f"Ошибка ввода: {e}")
    except Exception as e:
        print(f"Ошибка расчета: {e}")


def calc_paint_menu(calc):
    """Расчет площади окраски."""
    print("\n--- Расчет площади окраски ---")
    
    try:
        print("Типы профилей: лист, швеллер, уголок, двутавр, труба")
        profile_type = input("Тип профиля: ").strip()
        
        dimensions = {}
        
        if profile_type.lower() == "лист":
            dimensions["width"] = float(input("Ширина (мм): "))
            dimensions["height"] = float(input("Высота (мм): "))
        else:
            dimensions["size"] = float(input("Размер (мм): "))
            dimensions["height"] = float(input("Высота (мм): ")) if "двутавр" in profile_type.lower() or "швеллер" in profile_type.lower() else 0
            dimensions["width"] = float(input("Ширина полки (мм): ")) if "уголок" in profile_type.lower() else 0
        
        length = float(input("Длина (м): "))
        
        area = calc.calculate_paint_area(profile_type, dimensions, length)
        print(f"\n>>> Площадь окраски: {area} м²")
        
    except ValueError as e:
        print(f"Ошибка ввода: {e}")
    except Exception as e:
        print(f"Ошибка расчета: {e}")


def calc_cost_menu(calc):
    """Расчет стоимости."""
    print("\n--- Расчет стоимости ---")
    
    try:
        weight = float(input("Вес металла (кг): "))
        price = float(input("Цена за кг (руб): "))
        
        cost = calc.calculate_cost(weight, price)
        print(f"\n>>> Стоимость: {cost} руб")
        
    except ValueError as e:
        print(f"Ошибка ввода: {e}")
    except Exception as e:
        print(f"Ошибка расчета: {e}")


def menu_drawings(pdf_reader):
    """Меню работы с чертежами."""
    while True:
        print("\n--- Чертежи PDF ---")
        print("1. Открыть чертеж")
        print("2. Список чертежей")
        print("3. Извлечь таблицы")
        print("4. Извлечь размеры")
        print("0. Назад")
        
        choice = input("Выберите пункт: ").strip()
        
        if choice == "1":
            open_drawing_menu(pdf_reader)
        elif choice == "2":
            list_drawings_menu(pdf_reader)
        elif choice == "3":
            extract_tables_menu(pdf_reader)
        elif choice == "4":
            extract_dimensions_menu(pdf_reader)
        elif choice == "0":
            break
        else:
            print("Неверный выбор.")


def open_drawing_menu(pdf_reader):
    """Открытие чертежа."""
    print("\n--- Открыть чертеж ---")
    filepath = input("Путь к PDF файлу: ").strip()
    
    if not filepath:
        print("Укажите путь к файлу")
        return
    
    result = pdf_reader.open_drawing(filepath)
    
    print("\n>>> Информация о чертеже:")
    for key, value in result.items():
        print(f"    {key}: {value}")


def list_drawings_menu(pdf_reader):
    """Список чертежей."""
    print("\n--- Список чертежей ---")
    
    folder = input(f"Папка (Enter - {Config.DRAWINGS_FOLDER}): ").strip()
    if not folder:
        folder = None
    
    drawings = pdf_reader.list_drawings(folder)
    
    if drawings:
        print(f"\n>>> Найдено чертежей: {len(drawings)}")
        for i, d in enumerate(drawings, 1):
            size_kb = d.get('размер', 0) / 1024
            print(f"    {i}. {d['название']} ({size_kb:.1f} KB)")
    else:
        print("Чертежи не найдены")


def extract_tables_menu(pdf_reader):
    """Извлечение таблиц из чертежа."""
    print("\n--- Извлечь таблицы ---")
    filepath = input("Путь к PDF файлу: ").strip()
    
    if not filepath:
        print("Укажите путь к файлу")
        return
    
    tables = pdf_reader.extract_tables(filepath)
    
    print(f"\n>>> Найдено таблиц: {len(tables)}")
    for i, table in enumerate(tables, 1):
        print(f"    Таблица {i} (стр. {table.get('страница', '?')})")


def extract_dimensions_menu(pdf_reader):
    """Извлечение размеров из чертежа."""
    print("\n--- Извлечь размеры ---")
    filepath = input("Путь к PDF файлу: ").strip()
    
    if not filepath:
        print("Укажите путь к файлу")
        return
    
    dimensions = pdf_reader.extract_dimensions(filepath)
    
    print("\n>>> Найденные профили:")
    for profile in dimensions.get('профили', []):
        print(f"    - {profile}")
    
    print("\n>>> Найденные размеры:")
    for size in dimensions.get('размеры', []):
        print(f"    - {size}")


def menu_reports(excel_writer):
    """Меню отчетов."""
    while True:
        print("\n--- Отчеты Excel ---")
        print("1. Создать отчет")
        print("2. Спецификация металла")
        print("3. Карта раскроя")
        print("0. Назад")
        
        choice = input("Выберите пункт: ").strip()
        
        if choice == "1":
            create_report_menu(excel_writer)
        elif choice == "2":
            spec_menu(excel_writer)
        elif choice == "3":
            cutting_plan_menu(excel_writer)
        elif choice == "0":
            break
        else:
            print("Неверный выбор.")


def create_report_menu(excel_writer):
    """Создание отчета."""
    print("\n--- Создать отчет ---")
    
    data = {
        "название": input("Название отчета: ").strip() or "Отчет",
        "объект": input("Объект: ").strip(),
        "заказчик": input("Заказчик: ").strip(),
    }
    
    filename = input("Имя файла (Enter - авто): ").strip()
    if not filename:
        filename = f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    elif not filename.endswith('.xlsx'):
        filename += '.xlsx'
    
    result = excel_writer.create_report(data, filename)
    
    if result:
        print(f"\n>>> Отчет создан: {result}")
    else:
        print("\n>>> Ошибка создания отчета")


def spec_menu(excel_writer):
    """Создание спецификации."""
    print("\n--- Спецификация металла ---")
    
    spec_data = {
        "название": input("Название: ").strip() or "Спецификация",
        "позиции": [],
    }
    
    # Добавление позиций
    while True:
        add = input("Добавить позицию? (д/н): ").strip().lower()
        if add != 'д':
            break
        
        item = {
            "наименование": input("  Наименование: ").strip(),
            "обозначение": input("  Обозначение: ").strip(),
            "количество": input("  Количество: ").strip(),
            "материал": input("  Материал: ").strip(),
            "примечание": input("  Примечание: ").strip(),
        }
        spec_data["позиции"].append(item)
    
    if spec_data["позиции"]:
        result = excel_writer.write_specification(spec_data)
        if result:
            print(f"\n>>> Спецификация создана: {result}")
        else:
            print("\n>>> Ошибка создания спецификации")
    else:
        print("Спецификация пуста")


def cutting_plan_menu(excel_writer):
    """Создание карты раскроя."""
    print("\n--- Карта раскроя ---")
    
    cutting_data = {
        "детали": [],
    }
    
    # Добавление деталей
    while True:
        add = input("Добавить деталь? (д/н): ").strip().lower()
        if add != 'д':
            break
        
        detail = {
            "название": input("  Название: ").strip(),
            "ширина": input("  Ширина (мм): ").strip(),
            "длина": input("  Длина (мм): ").strip(),
            "количество": input("  Количество: ").strip(),
            "площадь": input("  Площадь (м²): ").strip(),
        }
        cutting_data["детали"].append(detail)
    
    cutting_data["всего_листов"] = input("Всего листов: ").strip()
    
    if cutting_data["детали"]:
        result = excel_writer.write_cutting_plan(cutting_data)
        if result:
            print(f"\n>>> Карта раскроя создана: {result}")
        else:
            print("\n>>> Ошибка создания карты раскроя")
    else:
        print("Карта раскроя пуста")


def menu_settings():
    """Меню настроек."""
    while True:
        print("\n--- Настройки ---")
        print(f"1. Папка чертежей: {Config.DRAWINGS_FOLDER}")
        print(f"2. Папка отчетов: {Config.REPORTS_FOLDER}")
        print(f"3. Плотность стали: {Config.STEEL_DENSITY} кг/м³")
        print("0. Назад")
        
        choice = input("Выберите пункт: ").strip()
        
        if choice == "1":
            new_folder = input("Новая папка чертежей: ").strip()
            if new_folder:
                Config.DRAWINGS_FOLDER = new_folder
                print("Сохранено")
        elif choice == "2":
            new_folder = input("Новая папка отчетов: ").strip()
            if new_folder:
                Config.REPORTS_FOLDER = new_folder
                print("Сохранено")
        elif choice == "3":
            try:
                new_density = float(input("Плотность стали (кг/м³): "))
                Config.STEEL_DENSITY = new_density
                print("Сохранено")
            except ValueError:
                print("Ошибка ввода")
        elif choice == "0":
            break
        else:
            print("Неверный выбор.")


def main():
    """Главная функция."""
    # Настройка логирования
    setup_logging()
    
    # Создание папок
    Config.setup_folders()
    
    # Инициализация модулей
    calc = MetalCalculator()
    pdf = PDFReader()
    excel = ExcelWriter()
    
    print(f"\nДобро пожаловать в {Config.APP_NAME}!")
    print("Для выхода введите '5' или '0' в любом меню")
    
    # Бесконечный цикл меню
    while True:
        show_menu()
        choice = input("Выберите пункт: ").strip()
        
        if choice == "1":
            menu_calculator(calc)
        elif choice == "2":
            menu_drawings(pdf)
        elif choice == "3":
            menu_reports(excel)
        elif choice == "4":
            menu_settings()
        elif choice == "5":
            print("\nДо свидания!")
            logging.info("Приложение закрыто")
            break
        else:
            print("Неверный выбор. Попробуйте снова.")


if __name__ == "__main__":
    # Добавляем импорт datetime для использования в main.py
    from datetime import datetime
    main()
