import type { LoadResult } from '@boxxy/model';
import { conceptPins, concepts } from '@boxxy/planning';
import { createNoslopReviewGate } from '@boxxy/review-noslop';
import { loadRules, rulesFileName } from '@boxxy/rules';
import type { ServerRegistrations } from './build-server-registrations.ts';
import { buildServerRegistrations } from './build-server-registrations.ts';

export interface RulesCheckout {
  // the commit of a git checkout, or `folder` for a plain folder
  readonly commit: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

// Loads a checkout as the server does, for the rules repository's check. A load reads only the
// gate's command builder, so a gate with no App keys loads what the server's own gate loads.
export function loadServerRules(checkout: RulesCheckout): LoadResult {
  return loadRegisteredRules(
    checkout,
    buildServerRegistrations(createNoslopReviewGate({ appEnv: {} })),
  );
}

// Loads a checkout with the concepts that this server registers, and the given phase kinds and
// worker names.
export function loadRegisteredRules(
  checkout: RulesCheckout,
  registrations: ServerRegistrations,
): LoadResult {
  return loadRules({ checkout, concepts, pins: conceptPins, ...registrations });
}

// The dry run's load: the server's own checkout with the given text as its rules file.
export function makeProposedRulesLoader(
  checkout: RulesCheckout,
  registrations: ServerRegistrations,
): (text: string) => LoadResult {
  return (text) =>
    loadRegisteredRules(
      {
        commit: checkout.commit,
        files: new Map([...checkout.files, [rulesFileName, new TextEncoder().encode(text)]]),
      },
      registrations,
    );
}
