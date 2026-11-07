import type { ConceptPin, LoadRejection, Registry } from '@boxxy/model';
import { buildRejection } from './build-rejection.ts';
import type { PinnedConcept } from './types.ts';

export function buildRegistry(
  pinned: readonly PinnedConcept[],
  pins: readonly ConceptPin[],
): { readonly value: Registry; readonly rejections: readonly LoadRejection[] } {
  const signal = collectByName(pinned, (concept) => concept.signals ?? []);
  const gate = collectByName(pinned, (concept) => concept.gates ?? []);
  const waiver = collectByName(pinned, (concept) => concept.waivers ?? []);
  const filterField = collectByName(pinned, (concept) => concept.filterFields ?? []);

  const lever = collectByName(pinned, (concept) =>
    (concept.levers ?? []).map((kind) => ({ name: kind, kind })),
  );

  return {
    value: {
      signal: signal.byName,
      gate: gate.byName,
      admission: new Map(),
      waiver: waiver.byName,
      'filter-field': filterField.byName,
      lever: lever.byName,
      view: new Map(),
      pins,
    },
    rejections: [
      ...signal.rejections,
      ...gate.rejections,
      ...waiver.rejections,
      ...filterField.rejections,
      ...lever.rejections,
    ],
  };
}

function collectByName<T extends { readonly name: string }>(
  pinned: readonly PinnedConcept[],
  pluginsOf: (concept: PinnedConcept['concept']) => readonly T[],
): { readonly byName: ReadonlyMap<string, T>; readonly rejections: readonly LoadRejection[] } {
  const byName = new Map<string, T>();
  const owners = new Map<string, string>();

  const rejections: LoadRejection[] = [];

  for (const entry of pinned) {
    for (const plugin of pluginsOf(entry.concept)) {
      const owner = owners.get(plugin.name);

      if (owner === undefined) {
        byName.set(plugin.name, plugin);
        owners.set(plugin.name, entry.concept.name);
      } else {
        rejections.push(
          buildRejection(['concepts', entry.entryIndex], {
            kind: 'invalid',
            message: `the concepts ${owner} and ${entry.concept.name} both register ${plugin.name}`,
          }),
        );
      }
    }
  }

  return { byName, rejections };
}
