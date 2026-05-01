import json
import os
from pathlib import Path


class AppState:
    """Singleton для хранения состояния приложения."""
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.current_file = None
        self.modified = False
        self.settings_dict = {}
        self._state_file = Path("app_state.json")
        self.load()
    
    def load(self):
        """Загрузка состояния из файла."""
        if self._state_file.exists():
            try:
                with open(self._state_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.current_file = data.get('current_file')
                    self.modified = data.get('modified', False)
                    self.settings_dict = data.get('settings_dict', {})
            except Exception:
                pass
    
    def save(self):
        """Сохранение состояния в файл."""
        data = {
            'current_file': self.current_file,
            'modified': self.modified,
            'settings_dict': self.settings_dict
        }
        try:
            with open(self._state_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
    
    def __setattr__(self, name, value):
        super().__setattr__(name, value)
        if hasattr(self, '_initialized') and self._initialized:
            if name in ('current_file', 'modified', 'settings_dict'):
                self.save()
