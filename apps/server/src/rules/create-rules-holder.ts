import { hashTree } from '@boxxy/content-hash';
import type { LoadRejection, LoadResult } from '@boxxy/model';
import type { RulesState, ServerLog } from '../types.ts';
import type { ServerRegistrations } from './build-server-registrations.ts';
import type { RulesCheckout } from './load-server-rules.ts';
import { loadRegisteredRules, makeProposedRulesLoader } from './load-server-rules.ts';
import type { RulesSource } from './read-rules-checkout.ts';
import { readRulesCheckout } from './read-rules-checkout.ts';

interface RulesHolder {
  readonly state: () => RulesState;

  // the dry run's load, beside the checkout the live rules came from
  readonly loadProposed: (text: string) => LoadResult;

  // the text of each file of the checkout the live rules came from, by its path, for the prompts
  readonly texts: () => ReadonlyMap<string, string>;

  // reads the checkout again, and loads it when it changed; a refused load keeps the rules
  readonly reload: () => Promise<void>;
}

export type RulesHolderAnswer =
  | { readonly kind: 'loaded'; readonly holder: RulesHolder }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'refused'; readonly rejections: readonly LoadRejection[] };

interface Held {
  readonly state: RulesState;
  readonly checkout: RulesCheckout;
  readonly signature: string;
}

// Loads the rules folder once, and swaps the rules, their checkout and the last refusal together
// on each reload, so a dry run never pairs new rules with an old checkout.
export async function createRulesHolder(
  source: RulesSource,
  log: ServerLog,
  registrations: ServerRegistrations,
): Promise<RulesHolderAnswer> {
  const first = await readRulesCheckout(source);

  if (first.kind === 'rejected') {
    return { kind: 'rejected', reason: first.reason };
  }

  const loaded = loadRegisteredRules(first.checkout, registrations);

  if (loaded.kind === 'rejected') {
    return { kind: 'refused', rejections: loaded.rejections };
  }

  let held: Held = {
    state: { rules: loaded.rules, lastRejected: null },
    checkout: first.checkout,
    signature: buildSignature(first.checkout),
  };

  const reload = async () => {
    const read = await readRulesCheckout(source);

    if (read.kind === 'rejected') {
      log.warn('the rules checkout could not be read; the rules stay', { reason: read.reason });

      return;
    }

    const signature = buildSignature(read.checkout);

    if (signature === held.signature) {
      return;
    }

    const next = loadRegisteredRules(read.checkout, registrations);

    if (next.kind === 'rejected') {
      log.warn('the rules load was refused; the rules stay', { commit: read.checkout.commit });

      const lastRejected = { commit: read.checkout.commit, rejections: next.rejections };

      held = { ...held, signature, state: { ...held.state, lastRejected } };

      return;
    }

    held = { state: { rules: next.rules, lastRejected: null }, checkout: read.checkout, signature };
  };

  return {
    kind: 'loaded',
    holder: {
      state: () => held.state,
      loadProposed: (text) => makeProposedRulesLoader(held.checkout, registrations)(text),
      texts: () => toTexts(held.checkout),
      reload,
    },
  };
}

function buildSignature(checkout: RulesCheckout): string {
  const files = [...checkout.files].map(([path, bytes]) => ({ path, bytes, executable: false }));

  return `${checkout.commit}:${hashTree(files)}`;
}

function toTexts(checkout: RulesCheckout): ReadonlyMap<string, string> {
  const decoder = new TextDecoder();

  return new Map([...checkout.files].map(([path, bytes]) => [path, decoder.decode(bytes)]));
}
