import type { promptPlaceholders } from './constants.ts';

export type PromptPlaceholder = (typeof promptPlaceholders)[number];

// Each value is plain text. An empty section is the empty string, which `{% if %}` reads as false.
export type PromptValues = Readonly<Record<PromptPlaceholder, string>>;
