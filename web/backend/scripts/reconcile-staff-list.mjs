import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const dataFile = path.resolve(process.cwd(), "data", "db.json");
const defaultPassword = "123456";

const canonical = [
  ["Начальник участка", "Сушков Н.И."],
  ["Руководитель проекта", "Григоренко Д.А."],
  ["Инженер ПТО", "Кардонэ А.Н."],
  ["Инженер ПТО", "Юровский В.Ю."],
  ["Инженер ПТО", "Суровцев А.С."],
  ["Инженер ПТО (Д)", "Балько А.Е."],
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
  ["Маляр", "Знобищев Д.В."],
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
  ["Изолировщик", "Горенцов А.Н."],
  ["Изолировщик", "Еруков С.А."],
  ["Изолировщик", "Захаров В.А."],
  ["Изолировщик", "Ильченко С.В."],
  ["Изолировщик", "Калинин Н.О."],
  ["Изолировщик", "Конаков А.В."],
  ["Изолировщик", "Конищев А.А."],
  ["Изолировщик", "Котенев П.И."],
  ["Изолировщик", "Кутлугильдин Д.В."],
  ["Изолировщик", "Лигеев С.Е."],
  ["Изолировщик", "Литвинов П.А."],
  ["Изолировщик", "Лопатин С.В."],
  ["Изолировщик", "Луньков И.А."],
  ["Изолировщик", "Лупанов А.А."],
  ["Изолировщик", "Мануйкин Н.В."],
  ["Изолировщик", "Михайлев В.С."],
  ["Изолировщик", "Наумов Д.А."],
  ["Изолировщик", "Папикян М.М."],
  ["Изолировщик", "Раззаков С.А."],
  ["Изолировщик", "Руденко А.А."],
  ["Изолировщик", "Смирнов Н.Н."],
  ["Изолировщик", "Смолко И.В."],
  ["Изолировщик", "Трофименко В.О."],
  ["Изолировщик", "Ульянов В.А."],
  ["Изолировщик", "Фадеев Д.В."],
  ["Изолировщик", "Хелашвили Г.А."],
  ["Изолировщик", "Шумилов А.Ю."],
  ["Изолировщик", "Щукин Э.Р."]
];

const aliases = new Map(
  [
    ["Юрочкин В.Ю.", "Юровский В.Ю."],
    ["Бачула А.Е.", "Балько А.Е."],
    ["Горенко А.Н.", "Горенцов А.Н."],
    ["Лигес С.", "Лигеев С.Е."],
    ["Улянов В.А.", "Ульянов В.А."]
    ,
    ["Знобишев Д.В.", "Знобищев Д.В."],
    ["Еркусов С.А.", "Еруков С.А."],
    ["Кутулильдин Д.В.", "Кутлугильдин Д.В."],
    ["Разаков С.А.", "Раззаков С.А."],
    ["Хелашвели Г.А.", "Хелашвили Г.А."]
  ].map(([wrong, right]) => [normalize(wrong), normalize(right)])
);

function normalize(input) {
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

const db = JSON.parse(fs.readFileSync(dataFile, "utf8"));
if (!Array.isArray(db.users)) db.users = [];

const byNormalized = new Map();
for (const user of db.users) {
  if (!user?.position) continue;
  const key = normalize(user.fullName || user.fullNameNormalized || "");
  byNormalized.set(key, user);
}

let updated = 0;
let created = 0;
for (const [position, fullName] of canonical) {
  const key = normalize(fullName);
  const role = position === "Начальник участка" || position === "Руководитель проекта" ? "director" : "isolator";

  let user = byNormalized.get(key);
  if (!user) {
    for (const [wrongNorm, rightNorm] of aliases) {
      if (rightNorm === key && byNormalized.has(wrongNorm)) {
        user = byNormalized.get(wrongNorm);
        break;
      }
    }
  }

  if (user) {
    const beforeName = user.fullName;
    const beforePosition = user.position;
    const beforeRole = user.role;
    user.fullName = fullName;
    user.fullNameNormalized = key;
    user.position = position;
    user.role = role;
    user.updatedAt = nowIso();
    if (beforeName !== user.fullName || beforePosition !== user.position || beforeRole !== user.role) {
      updated += 1;
    }
    continue;
  }

  const uid = makeId("u");
  db.users.push({
    uid,
    email: syntheticEmailForUid(uid),
    fullName,
    fullNameNormalized: key,
    position,
    passwordHash: await bcrypt.hash(defaultPassword, 10),
    role,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  created += 1;
}

fs.writeFileSync(dataFile, JSON.stringify(db, null, 2), "utf8");
console.log(`Reconciled staff list. Updated: ${updated}, Created: ${created}`);
