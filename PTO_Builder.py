import tkinter as tk
from tkinter import scrolledtext, messagebox
import requests
import os

API_URL = "https://openrouter.ai/api/v1/chat/completions"
API_KEY = "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"

def create():
    prompt = input_text.get("1.0", tk.END).strip()
    if not prompt:
        return
    
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    data = {"model": "minimax/MiniMax-M2.5", "messages": [{"role": "user", "content": prompt}]}
    
    try:
        resp = requests.post(API_URL, json=data, headers=headers, timeout=120)
        code = resp.json()["choices"][0]["message"]["content"]
        code_text.delete("1.0", tk.END)
        code_text.insert("1.0", code)
    except Exception as e:
        messagebox.showerror("Ошибка", str(e))

def run():
    code = code_text.get("1.0", tk.END)
    try:
        exec(code, {})
    except Exception as e:
        messagebox.showerror("Ошибка", str(e))

def save():
    code = code_text.get("1.0", tk.END)
    with open("program.py", "w", encoding="utf-8") as f:
        f.write(code)
    messagebox.showinfo("Сохранено", "Код сохранён в program.py")

root = tk.Tk()
root.title("AI Builder")
root.geometry("800x500")

input_text = tk.Text(root, height=4)
input_text.pack(fill="x", padx=10, pady=5)
input_text.insert("1.0", "Опишите программу...")

tk.Button(root, text="Создать", bg="green", fg="white", font=("Arial", 14), command=create).pack(fill="x", padx=10, pady=5)

code_text = scrolledtext.ScrolledText(root)
code_text.pack(fill="both", expand=True, padx=10, pady=5)

frame = tk.Frame(root)
frame.pack(fill="x", padx=10, pady=5)
tk.Button(frame, text="Запустить", bg="blue", fg="white", command=run).pack(side="left", padx=5)
tk.Button(frame, text="Сохранить", bg="gray", fg="white", command=save).pack(side="left", padx=5)

root.mainloop()
