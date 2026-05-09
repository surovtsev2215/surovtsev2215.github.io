# ПТО: бесплатный online backend + GitHub Pages

## Новый процесс (3 шага)

1. Запустите `setup-render-backend.bat`
   - Откроется Render Deploy.
   - Создайте сервис `pto-backend` на free плане.
   - Скопируйте URL сервиса: `https://...onrender.com`.

2. Запустите `set-github-api-url.bat`
   - Вставьте URL backend.
   - Скрипт запишет GitHub Variable `VITE_API_BASE_URL`.

3. Запустите `publish-online.bat`
   - Сайт пересоберется и опубликуется с новым API URL.

## Важно

- GitHub Pages публикует только фронтенд.
- Backend работает отдельно на Render.
- Все новые пользователи создаются админом в интерфейсе сайта.
