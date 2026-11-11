import { phaseKinds } from '@boxxy/closeout';
import type { LoadResult } from '@boxxy/model';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules, rulesFileName } from '@boxxy/rules';

export interface RulesCheckout {
  // the commit of a git checkout, or `folder` for a plain folder
  readonly commit: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

// Loads a checkout with the concepts and the phase kinds that this server registers.
export function loadServerRules(checkout: RulesCheckout): LoadResult {
  return loadRules({ checkout, concepts, pins: conceptPins, phases: phaseKinds });
}

// The dry run's load: the server's own checkout with the given text as its rules file.
export function makeProposedRulesLoader(checkout: RulesCheckout): (text: string) => LoadResult {
  return (text) =>
    loadServerRules({
      commit: checkout.commit,
      files: new Map([...checkout.files, [rulesFileName, new TextEncoder().encode(text)]]),
    });
}
