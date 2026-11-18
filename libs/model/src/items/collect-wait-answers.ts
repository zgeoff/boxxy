import invariant from 'tiny-invariant';
import type { ItemRules, PipelineStep } from '../rules/types.ts';
import type { AttemptRow, ItemRow, ItemShipped, PullRequestRow, SkipReason } from '../types.ts';
import type { WaitedAnswer } from './derive-item-state.ts';
import { findMergeCommit } from './find-merge-commit.ts';

interface CollectWaitAnswersInput {
  // the step the item stands at; undefined at an end or a hold
  readonly step: PipelineStep | undefined;
  readonly item: ItemRow;
  readonly attempts: readonly AttemptRow[];
  readonly pullRequests: readonly PullRequestRow[];
  readonly shipped: readonly ItemShipped[];
  readonly rules: Pick<ItemRules, 'waits' | 'repos'>;
}

// The answer of each wait of the step, in the step's order. A repo with no `repos` entry ships
// nothing.
export function collectWaitAnswers(input: CollectWaitAnswersInput): WaitedAnswer[] {
  const waits = input.step?.waits ?? [];

  if (waits.length === 0) {
    return [];
  }

  const subject = {
    item: input.item,
    mergeCommit: findMergeCommit(input.attempts, input.pullRequests),
    shipped: input.shipped,
  };

  const policy = input.rules.repos.get(input.item.repo) ?? { ships: 'none' as const };

  return waits.map((name) => {
    const kind = input.rules.waits.get(name);

    invariant(kind !== undefined, `the loader refuses a wait kind the server lacks: ${name}`);

    return { kind: name, answer: kind.read(subject, policy) };
  });
}

// The skip reason of the first wait that says skip, or null.
export function pickWaitSkip(answers: readonly WaitedAnswer[]): SkipReason | null {
  const skipped = answers.find((wait) => wait.answer === 'skip');

  return skipped === undefined ? null : `wait-skip:${skipped.kind}`;
}
