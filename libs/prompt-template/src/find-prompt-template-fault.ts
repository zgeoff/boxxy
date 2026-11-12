import { promptPlaceholders } from './constants.ts';
import { promptEngine } from './prompt-engine.ts';

const known: ReadonlySet<string> = new Set(promptPlaceholders);

// Why the template cannot render, or null when it can: a syntax error, a tag the engine does not
// have, an unknown filter, a name that is no placeholder, or a field read on a placeholder.
export function findPromptTemplateFault(template: string): string | null {
  const reads = collectGlobalReads(template);

  if (typeof reads === 'string') {
    return reads;
  }

  const unknown = [...new Set(reads.map((segments) => String(segments[0])))].filter(
    (name) => !known.has(name),
  );

  if (unknown.length > 0) {
    return `the template names ${formatNames(unknown)}, which is not a placeholder; the placeholders are ${promptPlaceholders.join(', ')}`;
  }

  const fields = reads.filter((segments) => segments.length > 1);

  if (fields.length > 0) {
    return `the template reads ${formatNames(fields.map((segments) => segments.join('.')))}, but each placeholder is plain text with no fields`;
  }

  return null;
}

function collectGlobalReads(
  template: string,
): ReturnType<typeof promptEngine.globalVariableSegmentsSync> | string {
  try {
    return promptEngine.globalVariableSegmentsSync(promptEngine.parse(template));
  } catch (error) {
    return `the template does not parse: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function formatNames(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(', ');
}
