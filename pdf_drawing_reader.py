# Читатель PDF чертежей
import logging
import os
from config import Config


class PDFReader:
    """Класс для работы с PDF чертежами."""
    
    def __init__(self):
        """Инициализация PDF ридера."""
        self.config = Config
        self.pdfplumber = None
        self._import_pdfplumber()
        logging.info("PDFReader инициализирован")
    
    def _import_pdfplumber(self):
        """Импорт библиотеки pdfplumber."""
        try:
            import pdfplumber
            self.pdfplumber = pdfplumber
            logging.info("pdfplumber загружен успешно")
        except ImportError:
            logging.warning("pdfplumber не установлен, используем заглушки")
            self.pdfplumber = None
    
    def open_drawing(self, filepath):
        """
        Открыть PDF чертеж.
        
        Args:
            filepath: путь к файлу PDF
        
        Returns:
            словарь с информацией о чертеже
        """
        try:
            logging.info(f"Открытие чертежа: {filepath}")
            
            if not os.path.exists(filepath):
                logging.error(f"Файл не найден: {filepath}")
                return {"ошибка": "Файл не найден", "путь": filepath}
            
            if self.pdfplumber is None:
                logging.warning("pdfplumber не доступен, возвращаем базовую информацию")
                return self._get_basic_info(filepath)
            
            with self.pdfplumber.open(filepath) as pdf:
                info = {
                    "путь": filepath,
                    "название": os.path.basename(filepath),
                    "страниц": len(pdf.pages),
                    "размер_файла": os.path.getsize(filepath),
                }
                
                # Попробуем извлечь текст с первой страницы
                if pdf.pages:
                    first_page = pdf.pages[0]
                    text = first_page.extract_text()
                    if text:
                        info["текст"] = text[:500]  # Первые 500 символов
                
                logging.info(f"Чертеж открыт: {info['страниц']} страниц")
                return info
                
        except Exception as e:
            logging.error(f"Ошибка открытия чертежа: {e}")
            return {"ошибка": str(e)}
    
    def _get_basic_info(self, filepath):
        """Получить базовую информацию о файле."""
        return {
            "путь": filepath,
            "название": os.path.basename(filepath),
            "размер_файла": os.path.getsize(filepath),
            "примечание": "pdfplumber не установлен",
        }
    
    def extract_tables(self, filepath):
        """
        Извлечь таблицы из PDF чертежа.
        
        Args:
            filepath: путь к файлу PDF
        
        Returns:
            список найденных таблиц
        """
        try:
            logging.info(f"Извлечение таблиц из: {filepath}")
            
            if self.pdfplumber is None:
                logging.warning("pdfplumber не доступен")
                return [{"примечание": "pdfplumber не установлен"}]
            
            tables = []
            
            with self.pdfplumber.open(filepath) as pdf:
                for page_num, page in enumerate(pdf.pages, 1):
                    page_tables = page.extract_tables()
                    if page_tables:
                        for table in page_tables:
                            tables.append({
                                "страница": page_num,
                                "таблица": table,
                            })
            
            logging.info(f"Найдено таблиц: {len(tables)}")
            return tables
            
        except Exception as e:
            logging.error(f"Ошибка извлечения таблиц: {e}")
            return [{"ошибка": str(e)}]
    
    def extract_dimensions(self, filepath):
        """
        Извлечь размеры профилей из чертежа.
        
        Args:
            filepath: путь к файлу PDF
        
        Returns:
            словарь с размерами
        """
        try:
            logging.info(f"Извлечение размеров из: {filepath}")
            
            if self.pdfplumber is None:
                logging.warning("pdfplumber не доступен")
                return self._extract_dimensions_fallback(filepath)
            
            dimensions = {
                "профили": [],
                "размеры": [],
            }
            
            with self.pdfplumber.open(filepath) as pdf:
                for page in pdf.pages:
                    # Извлекаем весь текст
                    text = page.extract_text()
                    if not text:
                        continue
                    
                    # Ищем размеры в тексте (например: "100х50", "L=5000", "Ø50")
                    import re
                    
                    # Паттерны для размеров
                    patterns = [
                        r'(\d+)[хX×](\d+)',  # 100х50
                        r'[Ll]=(\d+)',        # L=5000
                        r'Ø(\d+)',            # Ø50
                        r'δ(\d+)',            # δ10
                        r'H(\d+)',            # H100
                        r'b(\d+)',            # b50
                    ]
                    
                    for pattern in patterns:
                        matches = re.findall(pattern, text)
                        for match in matches:
                            if isinstance(match, tuple):
                                dimensions["размеры"].append("х".join(match))
                            else:
                                dimensions["размеры"].append(match)
                    
                    # Ищем названия профилей
                    profile_keywords = ["швеллер", "уголок", "двутавр", "труба", "профиль", "лист"]
                    for keyword in profile_keywords:
                        if keyword in text.lower():
                            dimensions["профили"].append(keyword)
            
            # Удаляем дубликаты
            dimensions["профили"] = list(set(dimensions["профили"]))
            dimensions["размеры"] = list(set(dimensions["размеры"]))
            
            logging.info(f"Найдено профилей: {len(dimensions['профили'])}, размеров: {len(dimensions['размеры'])}")
            return dimensions
            
        except Exception as e:
            logging.error(f"Ошибка извлечения размеров: {e}")
            return {"ошибка": str(e)}
    
    def _extract_dimensions_fallback(self, filepath):
        """Извлечение размеров без pdfplumber - через имя файла."""
        filename = os.path.basename(filepath)
        
        # Пытаемся извлечь размеры из имени файла
        import re
        dimensions = {
            "профили": [],
            "размеры": [],
            "примечание": "Извлечено из имени файла",
        }
        
        # Ищем размеры в имени файла
        size_pattern = r'(\d+)[хX×_](\d+)'
        matches = re.findall(size_pattern, filename)
        for match in matches:
            dimensions["размеры"].append(f"{match[0]}x{match[1]}")
        
        # Ищем профиль в имени файла
        profile_keywords = ["швеллер", "уголок", "двутавр", "труба", "профиль", "лист"]
        for keyword in profile_keywords:
            if keyword in filename.lower():
                dimensions["профили"].append(keyword)
        
        return dimensions
    
    def list_drawings(self, folder=None):
        """
        Получить список PDF чертежей в папке.
        
        Args:
            folder: папка с чертежами
        
        Returns:
            список файлов
        """
        try:
            if folder is None:
                folder = self.config.DRAWINGS_FOLDER
            
            logging.info(f"Поиск чертежей в папке: {folder}")
            
            if not os.path.exists(folder):
                logging.warning(f"Папка не существует: {folder}")
                return []
            
            drawings = []
            for filename in os.listdir(folder):
                if filename.lower().endswith('.pdf'):
                    filepath = os.path.join(folder, filename)
                    drawings.append({
                        "название": filename,
                        "путь": filepath,
                        "размер": os.path.getsize(filepath),
                    })
            
            logging.info(f"Найдено чертежей: {len(drawings)}")
            return drawings
            
        except Exception as e:
            logging.error(f"Ошибка получения списка чертежей: {e}")
            return []
