import type {
  Forge,
  ItemView,
  PipelineStep,
  PullRequestRow,
  SkipCondition,
  SkipReason,
  WaitedAnswer,
} from '@boxxy/model';
import { pickWaitSkip } from '@boxxy/model';
import { filterTaggedCriteria } from './filter-tagged-criteria.ts';

interface ReadGateSkipInput {
  readonly step: PipelineStep;
  readonly item: ItemView;

  // the item's linked pull requests, oldest first
  readonly pullRequests: readonly PullRequestRow[];

  // null on a server with no `github` section: no check ever reads as passed
  readonly forge: Forge | null;

  // the answer of each wait of the step, which the caller ran
  readonly waits: readonly WaitedAnswer[];
}

// The reason the step skips, or null when no gate says skip. The gates run in a fixed order,
// `criteria`, then `skipWhen`, then the waits, and the first that says skip settles the step.
export async function readGateSkip(input: ReadGateSkipInput): Promise<SkipReason | null> {
  const criteria = input.step.criteria;

  if (
    criteria !== undefined &&
    filterTaggedCriteria(input.item, input.step).acceptance.length === 0
  ) {
    return `no-criteria-tagged:${criteria.tagged}`;
  }

  for (const condition of input.step.skipWhen ?? []) {
    const passed = await probeCondition(condition, input);

    if (passed) {
      return `check-passed:${condition.checkPassed}`;
    }
  }

  return pickWaitSkip(input.waits);
}

// A forge that throws reads as not passed: the step runs, and the next claim reads again.
async function probeCondition(
  condition: SkipCondition,
  input: ReadGateSkipInput,
): Promise<boolean> {
  const latest = input.pullRequests.at(-1);

  if (input.forge === null || latest === undefined) {
    return false;
  }

  try {
    const ref = { repo: latest.repo, number: latest.number };

    const reading = await input.forge.readPullRequest(ref);

    const head = reading === 'not-found' ? undefined : reading.commits.at(-1)?.sha;

    if (head === undefined) {
      return false;
    }

    const checks = await input.forge.readChecks(latest.repo, head);

    return checks.get(condition.checkPassed)?.state === 'success';
  } catch {
    return false;
  }
}
