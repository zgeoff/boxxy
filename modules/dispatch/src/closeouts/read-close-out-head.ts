import { findPullRequestLink } from '@boxxy/closeout';
import type { AttemptRow, ClaimStore, CommitSha, Forge, Instant, ItemRules } from '@boxxy/model';
import { shouldReadHead } from './should-read-head.ts';

// `head`: the open pull request's head, or null when the item has no open pull request. `retry`: the
// forge did not answer, and the close-out settles nothing.
export type CloseOutHead =
  | { readonly kind: 'head'; readonly head: CommitSha | null }
  | { readonly kind: 'retry' };

export interface ReadCloseOutHeadInput {
  readonly store: ClaimStore;
  readonly forge: Forge | null;
  readonly rules: ItemRules;
  readonly now: Instant;

  // the body the session sent
  readonly body: unknown;
}

// Reads the head outside the store lock, and only for a close-out that needs it.
export async function readCloseOutHead(
  input: ReadCloseOutHeadInput,
  attempt: AttemptRow,
): Promise<CloseOutHead> {
  const evidence = await input.store.read((tx) => tx.listEvidence(attempt.id));

  if (!shouldReadHead(attempt.phase, input.body, evidence)) {
    return { kind: 'head', head: null };
  }

  if (input.forge === null) {
    return { kind: 'head', head: null };
  }

  const detail = await input.store.read((tx) =>
    tx.readItemDetail(attempt.item, input.now, input.rules),
  );

  const link = findPullRequestLink(detail?.pullRequests ?? []);

  if (link === null) {
    return { kind: 'head', head: null };
  }

  try {
    const reading = await input.forge.readPullRequest({ repo: link.repo, number: link.number });

    if (reading === 'not-found') {
      return { kind: 'retry' };
    }

    return { kind: 'head', head: reading.state === 'open' ? reading.head : null };
  } catch {
    return { kind: 'retry' };
  }
}
