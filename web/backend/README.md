# PTO Backend (no Firebase Functions)

Local API server that replaces Firebase Functions for auth and report storage.

## Run

```bash
npm install
npm run dev
```

Default URL: `http://localhost:8787`

## Environment

Copy `.env.example` values into your shell environment if needed:

- `PORT` - API port (default `8787`)
- `JWT_SECRET` - token secret
- `CORS_ORIGIN` - frontend origin, e.g. `http://localhost:4173`

## API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/admin/users`
- `GET /api/reports`
- `GET /api/reports/:id`
- `POST /api/reports`

Data is stored in `web/backend/data/db.json`.
