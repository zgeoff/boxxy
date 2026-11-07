export function toColumnName(field: string): string {
  return field.replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}
