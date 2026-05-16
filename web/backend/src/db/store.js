import * as jsonStore from "./jsonStore.js";
import * as postgresStore from "./postgresStore.js";

const usePostgres = Boolean(process.env.DATABASE_URL?.trim());
let mode = usePostgres ? "postgres" : "json";

export function getStoreMode() {
  return mode;
}

export async function initStore() {
  if (usePostgres) {
    await postgresStore.initPostgresStore();
    mode = "postgres";
    return;
  }
  await jsonStore.initJsonStore();
  mode = "json";
}

export async function shutdownStore() {
  if (mode === "postgres") await postgresStore.shutdownPostgresStore();
  else jsonStore.shutdownJsonStore();
}

export const countUsers = (...args) =>
  mode === "postgres" ? postgresStore.pgCountUsers(...args) : jsonStore.jsonCountUsers(...args);

export const findUserByNormalized = (...args) =>
  mode === "postgres" ? postgresStore.pgFindUserByNormalized(...args) : jsonStore.jsonFindUserByNormalized(...args);

export const findUserByUid = (...args) =>
  mode === "postgres" ? postgresStore.pgFindUserByUid(...args) : jsonStore.jsonFindUserByUid(...args);

export const listUsers = (...args) =>
  mode === "postgres" ? postgresStore.pgListUsers(...args) : jsonStore.jsonListUsers(...args);

export const createUser = (...args) =>
  mode === "postgres" ? postgresStore.pgCreateUser(...args) : jsonStore.jsonCreateUser(...args);

export const updateUser = (...args) =>
  mode === "postgres" ? postgresStore.pgUpdateUser(...args) : jsonStore.jsonUpdateUser(...args);

export const deleteUser = (...args) =>
  mode === "postgres" ? postgresStore.pgDeleteUser(...args) : jsonStore.jsonDeleteUser(...args);

export const listReports = (...args) =>
  mode === "postgres" ? postgresStore.pgListReports(...args) : jsonStore.jsonListReports(...args);

export const findReportById = (...args) =>
  mode === "postgres" ? postgresStore.pgFindReportById(...args) : jsonStore.jsonFindReportById(...args);

export const createReport = (...args) =>
  mode === "postgres" ? postgresStore.pgCreateReport(...args) : jsonStore.jsonCreateReport(...args);

export const updateReport = (...args) =>
  mode === "postgres" ? postgresStore.pgUpdateReport(...args) : jsonStore.jsonUpdateReport(...args);

export const listTasks = (...args) =>
  mode === "postgres" ? postgresStore.pgListTasks(...args) : jsonStore.jsonListTasks(...args);

export const findTaskById = (...args) =>
  mode === "postgres" ? postgresStore.pgFindTaskById(...args) : jsonStore.jsonFindTaskById(...args);

export const createTask = (...args) =>
  mode === "postgres" ? postgresStore.pgCreateTask(...args) : jsonStore.jsonCreateTask(...args);

export const updateTask = (...args) =>
  mode === "postgres" ? postgresStore.pgUpdateTask(...args) : jsonStore.jsonUpdateTask(...args);

export const deleteTask = (...args) =>
  mode === "postgres" ? postgresStore.pgDeleteTask(...args) : jsonStore.jsonDeleteTask(...args);

export const importSnapshot = (...args) => {
  if (mode !== "postgres") {
    throw new Error("importSnapshot is only available for PostgreSQL store.");
  }
  return postgresStore.pgImportSnapshot(...args);
};
