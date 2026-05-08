import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const dataFile = path.resolve(process.cwd(), "data", "db.json");
const defaultPassword = "123456";

const staff = [
  ["Начальник участка", "Сушков Н.И."],
  ["Руководитель проекта", "Григоренко Д.А."],
  ["Инженер ПТО", "Кардонэ А.Н."],
  ["Инженер ПТО", "Юрочкин В.Ю."],
  ["Инженер ПТО", "Суровцев А.С."],
  ["Инженер ПТО (Д)", "Бачула А.Е."],
  ["Производитель работ", "Букалов С.А."],
  ["Производитель работ", "Рекунов Я.А."],
  ["Мастер участка", "Яковлев В.А."],
  ["Мастер участка", "Сметанин И."],
  ["Мастер участка", "Дмитриев Д.А."],
  ["Мастер участка", "Бахтияров Е."],
  ["Мастер участка", "Толеуханов И."],
  ["Маляр", "Бачинин В.О."],
  ["Маляр", "Галюков Р.Н."],
  ["Маляр", "Гепалов Ю.В."],
  ["Маляр", "Гранкин И.А."],
  ["Маляр", "Демин И.О."],
  ["Маляр", "Елпанов В.В."],
  ["Маляр", "Ефимов К.В."],
  ["Маляр", "Знобишев Д.В."],
  ["Маляр", "Кожевников А.А."],
  ["Маляр", "Кудинов А.А."],
  ["Маляр", "Кухаренко А.А."],
  ["Маляр", "Лучинин Э.П."],
  ["Маляр", "Миронов А.В."],
  ["Маляр", "Панченко Ю.В."],
  ["Маляр", "Мильчаков Е.В."],
  ["Маляр", "Крупин Р.В."],
  ["Маляр", "Кугаевских Е.С."],
  ["Маляр", "Кудлаев С.Р."],
  ["Маляр", "Наурзбаев Е.Ж."],
  ["Изолировщик", "Амиров Р.М."],
  ["Изолировщик", "Андриенко С.А."],
  ["Изолировщик", "Белкин В.В."],
  ["Изолировщик", "Габбасов И.К."],
  ["Изолировщик", "Горенко А.Н."],
  ["Изолировщик", "Еркусов С.А."],
  ["Изолировщик", "Захаров В.А."],
  ["Изолировщик", "Ильченко С.В."],
  ["Изолировщик", "Калинин Н.О."],
  ["Изолировщик", "Конаков А.В."],
  ["Изолировщик", "Конищев А.А."],
  ["Изолировщик", "Котенев П.И."],
  ["Изолировщик", "Кутулильдин Д.В."],
  ["Изолировщик", "Лигес С."],
  ["Изолировщик", "Литвинов П.А."],
  ["Изолировщик", "Лопатин С.В."],
  ["Изолировщик", "Луньков И.А."],
  ["Изолировщик", "Лупанов А.А."],
  ["Изолировщик", "Мануйкин Н.В."],
  ["Изолировщик", "Михайлев В.С."],
  ["Изолировщик", "Наумов Д.А."],
  ["Изолировщик", "Папикян М.М."],
  ["Изолировщик", "Разаков С.А."],
  ["Изолировщик", "Руденко А.А."],
  ["Изолировщик", "Смирнов Н.Н."],
  ["Изолировщик", "Смолко И.В."],
  ["Изолировщик", "Трофименко В.О."],
  ["Изолировщик", "Улянов В.А."],
  ["Изолировщик", "Фадеев Д.В."],
  ["Изолировщик", "Хелашвели Г.А."],
  ["Изолировщик", "Шумилов А.Ю."],
  ["Изолировщик", "Щукин Э.Р."]
];

function normalizeFullName(input) {
  return String(input || "")
    .normalize("NFC")
    .replace(/[.\s]+/g, "")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .toLocaleLowerCase("ru-RU");
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function syntheticEmailForUid(uid) {
  return `${uid}@pto.local`;
}

function nowIso() {
  return new Date().toISOString();
}

const raw = fs.existsSync(dataFile) ? fs.readFileSync(dataFile, "utf8") : '{"users":[],"reports":[]}';
const db = JSON.parse(raw);
if (!Array.isArray(db.users)) db.users = [];
if (!Array.isArray(db.reports)) db.reports = [];

const existing = new Set(db.users.map((u) => normalizeFullName(u.fullNameNormalized || u.fullName)));
let created = 0;
for (const [position, fullName] of staff) {
  const normalized = normalizeFullName(fullName);
  if (existing.has(normalized)) continue;
  const uid = makeId("u");
  const role = position === "Начальник участка" || position === "Руководитель проекта" ? "director" : "isolator";
  db.users.push({
    uid,
    email: syntheticEmailForUid(uid),
    fullName,
    fullNameNormalized: normalized,
    position,
    passwordHash: await bcrypt.hash(defaultPassword, 10),
    role,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  existing.add(normalized);
  created += 1;
}

fs.writeFileSync(dataFile, JSON.stringify(db, null, 2), "utf8");
console.log(`Imported users: ${created}. Total users: ${db.users.length}. Default password: ${defaultPassword}`);
