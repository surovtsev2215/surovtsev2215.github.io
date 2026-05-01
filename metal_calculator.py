# Калькулятор для расчета металла
import logging
import math
from config import Config


class MetalCalculator:
    """Класс для расчета металлопроката."""
    
    def __init__(self):
        """Инициализация калькулятора."""
        self.config = Config
        logging.info("Калькулятор металла инициализирован")
    
    def calculate_weight(self, dimensions, profile_type, length):
        """
        Расчет массы металла по ГОСТ.
        
        Args:
            dimensions: словарь с размерами профиля
            profile_type: тип профиля (швеллер, уголок, двутавр, труба, лист)
            length: длина в метрах
        
        Returns:
            вес в кг
        """
        try:
            logging.info(f"Расчет веса: профиль={profile_type}, длина={length}м")
            
            # Для листа
            if profile_type.lower() == "лист":
                width = dimensions.get("width", 0) / 1000  # мм -> м
                thickness = dimensions.get("thickness", 0) / 1000  # мм -> м
                volume = width * thickness * length
                density = self.config.get_density(dimensions.get("material", "сталь"))
                weight = volume * density
                logging.info(f"Вес листа: {weight:.2f} кг")
                return round(weight, 2)
            
            # Для профилей - ищем в справочнике
            profile_key = f"{profile_type.lower()}_{dimensions.get('size', '')}"
            weight_per_meter = self.config.PROFILE_WEIGHTS.get(profile_key)
            
            if weight_per_meter:
                weight = weight_per_meter * length
                logging.info(f"Вес профиля (по ГОСТ): {weight:.2f} кг")
                return round(weight, 2)
            
            # Если не найден в справочнике - вычисляем по объему
            weight = self._calculate_weight_by_volume(dimensions, profile_type, length)
            logging.info(f"Вес профиля (расчетный): {weight:.2f} кг")
            return round(weight, 2)
            
        except Exception as e:
            logging.error(f"Ошибка расчета веса: {e}")
            return 0.0
    
    def _calculate_weight_by_volume(self, dimensions, profile_type, length):
        """Расчет веса по объему для неизвестного профиля."""
        density = self.config.get_density(dimensions.get("material", "сталь"))
        
        profile_type_lower = profile_type.lower()
        
        if "труба" in profile_type_lower:
            # Труба кольцевого сечения
            outer_d = dimensions.get("size", 0) / 1000  # мм -> м
            thickness = dimensions.get("thickness", 0) / 1000
            inner_d = outer_d - 2 * thickness
            area = (math.pi / 4) * (outer_d**2 - inner_d**2)
        
        elif "швеллер" in profile_type_lower or "двутавр" in profile_type_lower:
            # Двутавр/швеллер - примерный расчет
            height = dimensions.get("height", 0) / 1000
            width = dimensions.get("width", 0) / 1000
            thickness = dimensions.get("thickness", 0) / 1000
            area = (height * thickness * 2) + (width - thickness) * thickness
        
        elif "уголок" in profile_type_lower:
            # Уголок равнополочный
            size = dimensions.get("size", 0) / 1000
            thickness = dimensions.get("thickness", 0) / 1000
            area = size * thickness * 2 - thickness**2
        
        else:
            # Простой прямоугольный профиль
            width = dimensions.get("width", 0) / 1000
            height = dimensions.get("height", 0) / 1000
            area = width * height
        
        volume = area * length
        return volume * density
    
    def calculate_sheet_count(self, width, height, sheet_width, sheet_height):
        """
        Расчет количества листов для раскроя.
        
        Args:
            width: ширина детали (мм)
            height: высота детали (мм)
            sheet_width: ширина листа (мм)
            sheet_height: высота листа (мм)
        
        Returns:
            словарь с результатами раскроя
        """
        try:
            logging.info(f"Расчет раскроя: деталь {width}x{height}, лист {sheet_width}x{sheet_height}")
            
            # Количество деталей по ширине и высоте
            count_width = sheet_width // width
            count_height = sheet_height // height
            total_count = count_width * count_height
            
            # Площадь листа и детали
            sheet_area = (sheet_width * sheet_height) / 1_000_000  # м²
            detail_area = (width * height) / 1_000_000  # м²
            used_area = total_count * detail_area
            waste_percent = ((sheet_area - used_area) / sheet_area) * 100
            
            result = {
                "количество_листов": 1,
                "деталей_с_листа": total_count,
                "площадь_листа": round(sheet_area, 4),
                "площадь_детали": round(detail_area, 4),
                "использовано_процентов": round(100 - waste_percent, 2),
                "отходы_процентов": round(waste_percent, 2),
            }
            
            logging.info(f"Раскрой: {total_count} деталей с листа, отходы {waste_percent:.1f}%")
            return result
            
        except Exception as e:
            logging.error(f"Ошибка расчета раскроя: {e}")
            return {"ошибка": str(e)}
    
    def calculate_paint_area(self, profile_type, dimensions, length):
        """
        Расчет площади окраски металлоконструкций.
        
        Args:
            profile_type: тип профиля
            dimensions: словарь с размерами
            length: длина в метрах
        
        Returns:
            площадь окраски в м²
        """
        try:
            logging.info(f"Расчет площади окраски: профиль={profile_type}, длина={length}м")
            
            # Получаем коэффициент профиля
            coef = self.config.PAINT_COEFFICIENTS.get(profile_type.lower(), 1.0)
            
            # Площадь окраски = периметр * длина * коэффициент
            if profile_type.lower() == "лист":
                width = dimensions.get("width", 0) / 1000
                height = dimensions.get("height", 0) / 1000
                area = 2 * (width * height) * length * coef
            
            elif "труба" in profile_type.lower():
                outer_d = dimensions.get("size", 0) / 1000
                perimeter = math.pi * outer_d
                area = perimeter * length * coef
            
            elif "швеллер" in profile_type.lower() or "двутавр" in profile_type.lower():
                height = dimensions.get("height", 0) / 1000
                width = dimensions.get("width", 0) / 1000
                perimeter = 2 * (height + width)
                area = perimeter * length * coef
            
            elif "уголок" in profile_type.lower():
                size = dimensions.get("size", 0) / 1000
                perimeter = 2 * size
                area = perimeter * length * coef
            
            else:
                # Упрощенный расчет
                area = length * coef
            
            logging.info(f"Площадь окраски: {area:.2f} м²")
            return round(area, 2)
            
        except Exception as e:
            logging.error(f"Ошибка расчета площади окраски: {e}")
            return 0.0
    
    def calculate_cost(self, weight, price_per_kg):
        """
        Расчет стоимости металла.
        
        Args:
            weight: вес в кг
            price_per_kg: цена за 1 кг
        
        Returns:
            стоимость в рублях
        """
        try:
            if weight <= 0 or price_per_kg <= 0:
                logging.warning("Некорректные значения для расчета стоимости")
                return 0.0
            
            cost = weight * price_per_kg
            logging.info(f"Расчет стоимости: {weight}кг * {price_per_kg}руб = {cost}руб")
            return round(cost, 2)
            
        except Exception as e:
            logging.error(f"Ошибка расчета стоимости: {e}")
            return 0.0
