import { findPullRequestLink } from '@boxxy/closeout';
import type {
  AttemptRow,
  ClaimStore,
  CommitSha,
  Forge,
  Instant,
  ItemRules,
  NoHeadCause,
} from '@boxxy/model';
import { shouldReadHead } from './should-read-head.ts';

// `head`: the open pull request's head, or null with the `cause` when the close-out has no head to
// read, and a null `cause` when the close-out reads none. `retry`: the forge did not answer, and
// the close-out settles nothing.
export type CloseOutHead =
  | { readonly kind: 'head'; readonly head: CommitSha | null; readonly cause: NoHeadCause | null }
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
    return { kind: 'head', head: null, cause: null };
  }

  if (input.forge === null) {
    return { kind: 'head', head: null, cause: 'no-forge' };
  }

  const detail = await input.store.read((tx) =>
    tx.readItemDetail(attempt.item, input.now, input.rules),
  );

  const link = findPullRequestLink(detail?.pullRequests ?? []);

  if (link === null) {
    return { kind: 'head', head: null, cause: 'no-pull-request' };
  }

  try {
    const reading = await input.forge.readPullRequest({ repo: link.repo, number: link.number });

    if (reading === 'not-found') {
      return { kind: 'head', head: null, cause: 'not-found' };
    }

    return reading.state === 'open'
      ? { kind: 'head', head: reading.head, cause: null }
      : { kind: 'head', head: null, cause: 'closed' };
  } catch {
    return { kind: 'retry' };
  }
}
