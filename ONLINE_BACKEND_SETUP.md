# ПТО: бесплатный online backend + GitHub Pages

**Администраторам:** сначала читайте [INSTRUKCIYA_ADMIN.md](INSTRUKCIYA_ADMIN.md) — там всё простыми словами. Этот файл — техническая справка.

## Новый процесс (3 шага)

1. Запустите `setup-render-backend.bat`
   - Откроется Render Deploy (Blueprint из `render.yaml`).
   - Создайте сервис `pto-backend` и базу **PostgreSQL** `pto-db` (free).
   - Скопируйте URL сервиса: `https://...onrender.com`.

2. Запустите `set-github-api-url.bat`
   - Вставьте URL backend.
   - Скрипт запишет GitHub Variable `VITE_API_BASE_URL`.

3. Запустите `set-online-mode.bat`, затем `обнова.bat` (подтвердите `YES`)
   - Сайт пересоберётся и опубликуется с новым API URL.

## PostgreSQL на Render

- В `render.yaml` уже описаны `pto-db` и переменная `DATABASE_URL` для `pto-backend`.
- После первого деплоя с БД отчёты и пользователи хранятся в PostgreSQL и **не пропадают** при перезапуске сервиса.
- Локально без `DATABASE_URL` backend использует `web/backend/data/db.json` (режим `локалка.bat`).

### Однократная миграция из db.json

Если есть старый файл `web/backend/data/db.json` с данными:

```bash
cd web/backend
set DATABASE_URL=postgresql://...   # connection string с Render
npm run migrate:json-to-pg
```

## Важно

- GitHub Pages публикует только фронтенд.
- Backend работает отдельно на Render.
- Все новые пользователи создаются админом в интерфейсе сайта.
- В production отчёты сохраняются только через API (не localStorage).

## Проверка после деплоя

1. Войти сотрудником → сдать отчёт → виден в истории.
2. Войти ИТР → отчёт в разделе «Отчёты».
3. Войти админом → «Все отчёты» и «Пользователи».
4. Перезапустить сервис на Render → данные на месте.

## Стабильность (бесплатно)

Настройте [UptimeRobot](https://uptimerobot.com): монитор HTTP на `https://ВАШ-СЕРВИС.onrender.com/api/health`, интервал 5–10 минут. Это уменьшает «засыпание» сервера на free-тарифе Render.
