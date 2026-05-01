# Главный модуль приложения ПТО
import config
import calculator
import pdf_reader
import excel_writer


def show_menu():
    """Отображение главного меню."""
    print("\n" + "=" * 40)
    print(f"{config.APP_NAME} v{config.APP_VERSION}")
    print("=" * 40)
    print("1. Расчет металла")
    print("2. Просмотр чертежей")
    print("3. Создание отчета")
    print("4. Настройки")
    print("0. Выход")
    print("=" * 40)


def menu_calculator():
    """Меню расчета металла."""
    print("\n--- Расчет металла ---")
    print("1. Рассчитать вес")
    print("2. Рассчитать раскрой")
    print("3. Рассчитать стоимость")
    print("0. Назад")
    # Заглушка
    pass


def menu_drawings():
    """Меню работы с чертежами."""
    print("\n--- Чертежи ---")
    print("1. Открыть чертеж")
    print("2. Список чертежей")
    print("3. Извлечь размеры")
    print("0. Назад")
    # Заглушка
    pass


def menu_reports():
    """Меню отчетов."""
    print("\n--- Отчеты ---")
    print("1. Отчет по металлу")
    print("2. Спецификация")
    print("0. Назад")
    # Заглушка
    pass


def menu_settings():
    """Меню настроек."""
    print("\n--- Настройки ---")
    print("1. Папка чертежей")
    print("2. Папка отчетов")
    print("3. Плотность металла")
    print("0. Назад")
    # Заглушка
    pass


def main():
    """Главная функция."""
    while True:
        show_menu()
        choice = input("Выберите пункт: ").strip()
        
        if choice == "1":
            menu_calculator()
        elif choice == "2":
            menu_drawings()
        elif choice == "3":
            menu_reports()
        elif choice == "4":
            menu_settings()
        elif choice == "0":
            print("\nДо свидания!")
            break
        else:
            print("\nНеверный выбор. Попробуйте снова.")


if __name__ == "__main__":
    main()
