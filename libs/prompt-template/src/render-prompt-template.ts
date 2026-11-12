import invariant from 'tiny-invariant';
import { promptEngine } from './prompt-engine.ts';
import type { PromptValues } from './types.ts';

// Liquid writes each value as text and never parses it again, so a value that holds `{{ }}` or
// `{% %}` reaches the agent as written.
export function renderPromptTemplate(template: string, values: PromptValues): string {
  const rendered: unknown = promptEngine.parseAndRenderSync(template, values);

  invariant(typeof rendered === 'string', 'a Liquid render returns text');

  return rendered;
}
