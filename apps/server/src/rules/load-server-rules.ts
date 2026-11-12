import type { LoadResult, PhaseKind } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules, rulesFileName } from '@boxxy/rules';

export interface RulesCheckout {
  // the commit of a git checkout, or `folder` for a plain folder
  readonly commit: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

// The names of the workers this server builds: the atc worker only.
const workers = [brandSchemas.workerKindName.parse('atc.session')];

// Loads a checkout with the concepts and the workers that this server registers, and the phase
// kinds it built, the review phase kind on its review gate among them.
export function loadServerRules(checkout: RulesCheckout, phases: readonly PhaseKind[]): LoadResult {
  return loadRules({ checkout, concepts, pins: conceptPins, phases, workers });
}

// The dry run's load: the server's own checkout with the given text as its rules file.
export function makeProposedRulesLoader(
  checkout: RulesCheckout,
  phases: readonly PhaseKind[],
): (text: string) => LoadResult {
  return (text) =>
    loadServerRules(
      {
        commit: checkout.commit,
        files: new Map([...checkout.files, [rulesFileName, new TextEncoder().encode(text)]]),
      },
      phases,
    );
}
