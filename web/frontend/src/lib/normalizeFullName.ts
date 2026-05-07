/**
 * Единая нормализация ФИО для входа и уникальности в demo.
 */
export function normalizeFullName(input: string): string {
  return input
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
}
