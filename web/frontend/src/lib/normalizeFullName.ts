function normalizeLetters(input: string): string {
  return input.normalize("NFC").replace(/ё/g, "е").replace(/Ё/g, "Е");
}

function capitalizeWord(value: string): string {
  if (!value) return "";
  return value[0].toLocaleUpperCase("ru-RU") + value.slice(1).toLocaleLowerCase("ru-RU");
}

function splitNameParts(input: string): string[] {
  return normalizeLetters(input)
    .trim()
    .replace(/[.\s]+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.replace(/[^\p{L}-]/gu, ""))
    .filter(Boolean);
}

export function hasPatronymic(input: string): boolean {
  const parts = splitNameParts(input);
  if (parts.length >= 3) return true;
  if (parts.length !== 1) return false;
  const onePart = parts[0];
  const matched = onePart.match(/^([\p{L}-]+?)([\p{Lu}]{1,4})$/u);
  if (!matched) return false;
  return matched[2].length >= 2;
}

/**
 * Приводит имя к формату "ФамилияИО" для хранения и отображения.
 */
export function formatFullNameForDisplay(input: string): string {
  const normalized = normalizeLetters(input).trim();
  if (!normalized) return "";

  const parts = splitNameParts(normalized);

  if (parts.length >= 2) {
    const surname = capitalizeWord(parts[0]);
    const initials = parts
      .slice(1)
      .map((part) => part[0]?.toLocaleUpperCase("ru-RU") ?? "")
      .join("");
    return `${surname}${initials}`;
  }

  const onePart = parts[0] ?? normalized.replace(/[^\p{L}-]/gu, "");
  if (!onePart) return "";
  const matched = onePart.match(/^([\p{L}-]+?)([\p{Lu}]{1,4})$/u);
  if (matched) {
    return `${capitalizeWord(matched[1])}${matched[2].toLocaleUpperCase("ru-RU")}`;
  }
  return capitalizeWord(onePart);
}

/**
 * Единая нормализация имени для входа и уникальности.
 */
export function normalizeFullName(input: string): string {
  return formatFullNameForDisplay(input)
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\d]/gu, "");
}
