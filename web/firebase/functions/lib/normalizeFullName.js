"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeFullName = normalizeFullName;
/** Должно совпадать с web/frontend/src/lib/normalizeFullName.ts */
function normalizeFullName(input) {
    return input
        .normalize("NFC")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("ru-RU")
        .replace(/ё/g, "е");
}
