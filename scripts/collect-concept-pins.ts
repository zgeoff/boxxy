import { posix } from 'node:path';
import type { ContentHash } from '@boxxy/content-hash';
import { hashTree } from '@boxxy/content-hash';

export interface ConceptRef {
  readonly name: string;
  readonly version: number;
}

export interface CollectedPin {
  readonly name: string;
  readonly ref: `${string}@${number}`;
  readonly sourceHash: ContentHash;
}

export function collectConceptPins(
  concepts: readonly ConceptRef[],
  files: ReadonlyMap<string, Uint8Array>,
): CollectedPin[] {
  return concepts
    .map((concept) => ({
      name: concept.name,
      ref: `${concept.name}@${concept.version}` as const,
      sourceHash: hashTree(
        collectSourcePaths(`concepts/${concept.name}.ts`, files).map((path) => ({
          path,
          bytes: getBytes(files, path),
          executable: false,
        })),
      ),
    }))
    .toSorted((left, right) => (left.name < right.name ? -1 : 1));
}

function collectSourcePaths(entry: string, files: ReadonlyMap<string, Uint8Array>): string[] {
  const visited = new Set<string>();

  const queue = [entry];

  const decoder = new TextDecoder();

  while (queue.length > 0) {
    const path = queue.shift();

    if (path !== undefined && !visited.has(path)) {
      visited.add(path);

      const source = decoder.decode(getBytes(files, path));

      queue.push(...collectRelativeImports(path, source));
    }
  }

  return [...visited];
}

function getBytes(files: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const bytes = files.get(path);

  if (bytes === undefined) {
    throw new Error(`${path} is not a source file of the package`);
  }

  return bytes;
}

// a type-only import counts too, which Bun's transpiler drops from its import scan
const importPattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](?<specifier>[^'"]+)['"]/gu;

function collectRelativeImports(path: string, source: string): string[] {
  return [...source.matchAll(importPattern)]
    .map((found) => found.groups?.['specifier'] ?? '')
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => posix.join(posix.dirname(path), specifier));
}
