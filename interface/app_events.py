class EventBus:
    """Шина событий для связи между вкладками."""
    def __init__(self):
        self._listeners = {}
    
    def on(self, event, callback):
        """Подписка на событие."""
        if event not in self._listeners:
            self._listeners[event] = []
        self._listeners[event].append(callback)
    
    def emit(self, event, data=None):
        """Испускание события."""
        if event in self._listeners:
            for callback in self._listeners[event]:
                callback(data)


# Глобальный экземпляр
event_bus = EventBus()
