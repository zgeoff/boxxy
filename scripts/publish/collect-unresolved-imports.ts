export interface PackedSource {
  // relative to the package folder
  readonly path: string;

  readonly text: string;
}

const importPattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](?<specifier>[^'"\n]+)['"]/gu;

// The faults of a package whose shipped source imports a bare name that a consumer's install does
// not bring: a dev dependency is never installed, and an optional peer counts as listed.
export function collectUnresolvedImports(
  manifestText: string,
  sources: readonly PackedSource[],
): string[] {
  const manifest: unknown = JSON.parse(manifestText);
  const listed = collectListedNames(manifest);

  return sources.flatMap((source) =>
    [...source.text.matchAll(importPattern)]
      .map((match) => match.groups?.['specifier'])
      .filter((specifier) => specifier !== undefined)
      .map((specifier) => toPackageName(specifier))
      .filter((name) => isBareName(name) && !listed.has(name))
      .toSorted()
      .filter((name, index, names) => names.indexOf(name) === index)
      .map(
        (name) => `${source.path} imports ${name}, which the manifest lists in no dependency field`,
      ),
  );
}

const dependencyFields = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;

function collectListedNames(manifest: unknown): Set<string> {
  const names = new Set<string>(['bun']);

  if (typeof manifest !== 'object' || manifest === null) {
    return names;
  }

  if ('name' in manifest && typeof manifest.name === 'string') {
    names.add(manifest.name);
  }

  for (const field of dependencyFields) {
    const value: unknown = Reflect.get(manifest, field);

    if (typeof value === 'object' && value !== null) {
      for (const name of Object.keys(value)) {
        names.add(name);
      }
    }
  }

  return names;
}

function toPackageName(specifier: string): string {
  const parts = specifier.split('/');

  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

function isBareName(name: string): boolean {
  return !name.startsWith('.') && !name.startsWith('node:') && !name.startsWith('bun:');
}
