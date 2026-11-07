export function normaliseTitle(title: string): string {
  return title.trim().toLowerCase().replaceAll(/\s+/gu, ' ');
}
