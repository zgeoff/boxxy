// Each `{{name}}` with a value is replaced in one pass, so a value that holds `{{…}}` stays as it
// is. Any other text of the template, and a placeholder with no value, stays as it is.
export function renderPrompt(template: string, values: Readonly<Record<string, string>>): string {
  return template.replaceAll(
    /\{\{(?<name>[a-z_]+)\}\}/gu,
    (whole, name: string) => values[name] ?? whole,
  );
}
