# GUI для приложения ПТО (обратная совместимость)
from app import *

if __name__ == "__main__":
    from core.main_window import MainWindow
    app = MainWindow()
    app.mainloop()
