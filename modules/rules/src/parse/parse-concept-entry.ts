import type { ConceptEntry, ConceptName } from '@boxxy/model';

export function parseConceptEntry(entry: ConceptEntry): {
  readonly name: ConceptName;
  readonly version: number;
} {
  const at = entry.lastIndexOf('@');

  return { name: entry.slice(0, at), version: Number(entry.slice(at + 1)) };
}
