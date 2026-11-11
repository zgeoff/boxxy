export function parseJSONText(text: string): unknown {
  const parsed: unknown = JSON.parse(text);

  return parsed;
}
