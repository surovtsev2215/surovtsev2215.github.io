import sys
from pathlib import Path


def log(message, level='INFO'):
    """Простой логгер."""
    print(f"[{level}] {message}")
    
    log_file = Path("pto.log")
    try:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"[{level}] {message}\n")
    except Exception:
        pass
