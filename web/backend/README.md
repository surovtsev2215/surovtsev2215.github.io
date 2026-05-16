# PTO Backend (no Firebase Functions)

Local API server for auth, users, and report storage.

## Run

Before the first start, copy `data/db.json.example` to `data/db.json` (only needed without PostgreSQL).

```bash
npm install
npm run dev
```

Default URL: `http://localhost:8787`

## Storage

- **Render (production):** PostgreSQL via `DATABASE_URL` from `render.yaml` (`pto-db`).
- **Local:** if `DATABASE_URL` is unset, data is stored in `data/db.json`.

Migrate existing JSON to PostgreSQL once:

```bash
DATABASE_URL="postgresql://..." npm run migrate:json-to-pg
```

## Environment

- `PORT` — API port (default `8787`)
- `JWT_SECRET` — token secret
- `CORS_ORIGIN` — frontend origin, e.g. `http://localhost:4173` or GitHub Pages URL
- `DATABASE_URL` — PostgreSQL connection string (Render sets this automatically)

## API

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/admin/users`
- `GET /api/admin/users`
- `PUT /api/admin/users/:uid`
- `DELETE /api/admin/users/:uid`
- `GET /api/reports`
- `GET /api/reports/:id`
- `POST /api/reports`
- `GET /api/health`
