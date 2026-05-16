import pg from "pg";

const { Pool } = pg;

let pool = null;

function rowToUser(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    email: row.email,
    fullName: row.full_name,
    fullNameNormalized: row.full_name_normalized,
    position: row.position || "",
    phone: row.phone || "",
    telegram: row.telegram || "",
    passwordHash: row.password_hash,
    role: row.role,
    allowedSections: row.allowed_sections || undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ""),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || "")
  };
}

function userToRow(user) {
  return {
    uid: user.uid,
    email: user.email,
    full_name: user.fullName,
    full_name_normalized: user.fullNameNormalized,
    position: user.position || "",
    phone: user.phone || "",
    telegram: user.telegram || "",
    password_hash: user.passwordHash,
    role: user.role,
    allowed_sections: user.allowedSections ?? null,
    created_at: user.createdAt,
    updated_at: user.updatedAt
  };
}

export async function initPostgresStore() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL store.");

  pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      full_name TEXT NOT NULL,
      full_name_normalized TEXT NOT NULL UNIQUE,
      position TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      telegram TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      allowed_sections JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      report_date TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      payload JSONB NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function pgGetSetting(key) {
  const { rows } = await pool.query("SELECT payload FROM app_settings WHERE key = $1 LIMIT 1", [key]);
  return rows[0]?.payload ?? null;
}

export async function pgSetSetting(key, payload) {
  await pool.query(
    `INSERT INTO app_settings (key, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [key, JSON.stringify(payload)]
  );
  return payload;
}

export async function shutdownPostgresStore() {
  if (pool) await pool.end();
  pool = null;
}

export async function pgCountUsers() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM users");
  return rows[0]?.count ?? 0;
}

export async function pgFindUserByNormalized(norm) {
  const { rows } = await pool.query("SELECT * FROM users WHERE full_name_normalized = $1 LIMIT 1", [norm]);
  return rowToUser(rows[0]);
}

export async function pgFindUserByUid(uid) {
  const { rows } = await pool.query("SELECT * FROM users WHERE uid = $1 LIMIT 1", [uid]);
  return rowToUser(rows[0]);
}

export async function pgListUsers() {
  const { rows } = await pool.query("SELECT * FROM users");
  return rows.map(rowToUser);
}

export async function pgCreateUser(user) {
  const r = userToRow(user);
  await pool.query(
    `INSERT INTO users (
      uid, email, full_name, full_name_normalized, position, phone, telegram,
      password_hash, role, allowed_sections, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      r.uid,
      r.email,
      r.full_name,
      r.full_name_normalized,
      r.position,
      r.phone,
      r.telegram,
      r.password_hash,
      r.role,
      r.allowed_sections,
      r.created_at,
      r.updated_at
    ]
  );
  return user;
}

export async function pgUpdateUser(uid, updater) {
  const user = await pgFindUserByUid(uid);
  if (!user) return null;
  updater(user);
  const r = userToRow(user);
  await pool.query(
    `UPDATE users SET
      email = $2, full_name = $3, full_name_normalized = $4, position = $5,
      phone = $6, telegram = $7, password_hash = $8, role = $9,
      allowed_sections = $10, updated_at = $11
    WHERE uid = $1`,
    [
      uid,
      r.email,
      r.full_name,
      r.full_name_normalized,
      r.position,
      r.phone,
      r.telegram,
      r.password_hash,
      r.role,
      r.allowed_sections,
      r.updated_at
    ]
  );
  return user;
}

export async function pgDeleteUser(uid) {
  const { rowCount } = await pool.query("DELETE FROM users WHERE uid = $1", [uid]);
  return rowCount > 0;
}

function payloadToReport(row) {
  const payload = row.payload || {};
  return { ...payload, id: row.id, userId: row.user_id, createdAt: Number(row.created_at || payload.createdAt || 0) };
}

export async function pgListReports(filter = {}) {
  let query = "SELECT id, user_id, created_at, payload FROM reports WHERE 1=1";
  const params = [];
  if (filter.userId) {
    params.push(filter.userId);
    query += ` AND user_id = $${params.length}`;
  }
  if (filter.from) {
    params.push(String(filter.from));
    query += ` AND report_date >= $${params.length}`;
  }
  if (filter.to) {
    params.push(String(filter.to));
    query += ` AND report_date <= $${params.length}`;
  }
  if (filter.status) {
    params.push(String(filter.status));
    query += ` AND COALESCE(payload->>'status', 'submitted') = $${params.length}`;
  }
  if (filter.since) {
    params.push(Number(filter.since));
    query += ` AND created_at > $${params.length}`;
  }
  query += " ORDER BY created_at DESC";
  if (filter.limit) {
    params.push(Math.min(500, Math.max(1, Number(filter.limit))));
    query += ` LIMIT $${params.length}`;
  }
  if (filter.offset) {
    params.push(Math.max(0, Number(filter.offset)));
    query += ` OFFSET $${params.length}`;
  }
  const { rows } = await pool.query(query, params);
  return rows.map(payloadToReport);
}

export async function pgFindReportById(id) {
  const { rows } = await pool.query("SELECT id, user_id, created_at, payload FROM reports WHERE id = $1 LIMIT 1", [id]);
  return rows[0] ? payloadToReport(rows[0]) : null;
}

export async function pgCreateReport(report) {
  const reportDate = String(report.date || "");
  await pool.query(
    `INSERT INTO reports (id, user_id, report_date, created_at, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [report.id, report.userId, reportDate, Number(report.createdAt || Date.now()), JSON.stringify(report)]
  );
  return report;
}

export async function pgUpdateReport(report) {
  const reportDate = String(report.date || "");
  const { rowCount } = await pool.query(
    `UPDATE reports SET user_id = $2, report_date = $3, created_at = $4, payload = $5::jsonb WHERE id = $1`,
    [report.id, report.userId, reportDate, Number(report.createdAt || Date.now()), JSON.stringify(report)]
  );
  return rowCount > 0 ? report : null;
}

export async function pgDeleteReport(id) {
  const { rowCount } = await pool.query("DELETE FROM reports WHERE id = $1", [id]);
  return rowCount > 0;
}

function payloadToTask(row) {
  return row.payload || {};
}

export async function pgListTasks() {
  const { rows } = await pool.query("SELECT payload FROM tasks ORDER BY created_at DESC");
  return rows.map(payloadToTask);
}

export async function pgFindTaskById(id) {
  const { rows } = await pool.query("SELECT payload FROM tasks WHERE id = $1 LIMIT 1", [id]);
  return rows[0] ? payloadToTask(rows[0]) : null;
}

export async function pgCreateTask(task) {
  await pool.query(
    `INSERT INTO tasks (id, payload, created_at, updated_at)
     VALUES ($1, $2::jsonb, COALESCE($3::timestamptz, NOW()), COALESCE($4::timestamptz, NOW()))`,
    [task.id, JSON.stringify(task), task.createdAt || null, task.updatedAt || null]
  );
  return task;
}

export async function pgUpdateTask(task) {
  const { rowCount } = await pool.query(
    `UPDATE tasks SET payload = $2::jsonb, updated_at = COALESCE($3::timestamptz, NOW()) WHERE id = $1`,
    [task.id, JSON.stringify(task), task.updatedAt || null]
  );
  return rowCount > 0 ? task : null;
}

export async function pgDeleteTask(id) {
  const { rowCount } = await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
  return rowCount > 0;
}

export async function pgImportSnapshot({ users = [], reports = [], tasks = [] }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const user of users) {
      const r = userToRow(user);
      await client.query(
        `INSERT INTO users (
          uid, email, full_name, full_name_normalized, position, phone, telegram,
          password_hash, role, allowed_sections, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (uid) DO NOTHING`,
        [
          r.uid,
          r.email,
          r.full_name,
          r.full_name_normalized,
          r.position,
          r.phone,
          r.telegram,
          r.password_hash,
          r.role,
          r.allowed_sections,
          r.created_at,
          r.updated_at
        ]
      );
    }
    for (const report of reports) {
      await client.query(
        `INSERT INTO reports (id, user_id, report_date, created_at, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [
          report.id,
          report.userId,
          String(report.date || ""),
          Number(report.createdAt || Date.now()),
          JSON.stringify(report)
        ]
      );
    }
    for (const task of tasks) {
      await client.query(
        `INSERT INTO tasks (id, payload, created_at, updated_at)
         VALUES ($1, $2::jsonb, COALESCE($3::timestamptz, NOW()), COALESCE($4::timestamptz, NOW()))
         ON CONFLICT (id) DO NOTHING`,
        [task.id, JSON.stringify(task), task.createdAt || null, task.updatedAt || null]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
