const FULL_NAME_PATTERN = /^[A-Za-zА-Яа-яЁё0-9._-]{2,64}$/;

export function validateFullNameInput(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Введите ФамилияИО.";
  if (!FULL_NAME_PATTERN.test(value)) {
    return "ФамилияИО: 2-64 символа, только буквы/цифры и . _ -";
  }
  return null;
}

export function validatePasswordInput(raw: string): string | null {
  if (!raw.trim()) return "Введите пароль.";
  if (raw.length < 2) return "Пароль должен быть минимум 2 символа.";
  if (raw.length > 128) return "Пароль слишком длинный.";
  return null;
}
