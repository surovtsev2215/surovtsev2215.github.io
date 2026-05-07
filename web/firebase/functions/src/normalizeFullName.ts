/** Должно совпадать с web/frontend/src/lib/normalizeFullName.ts */
export function normalizeFullName(input: string): string {
  return input
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
}
