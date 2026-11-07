import type { Concept, ConceptPin, Registry } from '@boxxy/model';
import invariant from 'tiny-invariant';

export function buildRegistry(concepts: readonly Concept[], pins: readonly ConceptPin[]): Registry {
  return {
    signal: collectByName(concepts.flatMap((concept) => concept.signals ?? [])),
    gate: collectByName(concepts.flatMap((concept) => concept.gates ?? [])),
    admission: new Map(),
    waiver: collectByName(concepts.flatMap((concept) => concept.waivers ?? [])),
    'filter-field': collectByName(concepts.flatMap((concept) => concept.filterFields ?? [])),
    lever: new Map(
      concepts.flatMap((concept) =>
        (concept.levers ?? []).map((kind) => [kind, { kind }] as const),
      ),
    ),
    view: new Map(),
    pins,
  };
}

function collectByName<T extends { readonly name: string }>(
  plugins: readonly T[],
): ReadonlyMap<string, T> {
  const byName = new Map<string, T>();

  for (const plugin of plugins) {
    invariant(!byName.has(plugin.name), `two pinned concepts register ${plugin.name}`);

    byName.set(plugin.name, plugin);
  }

  return byName;
}
