import { match } from 'ts-pattern';

// the refusals of a `check` or a `verdict`; the answer's other refusals are the command's own
interface CheckedRefusal {
  readonly reason: string;
  readonly check?: string;
  readonly feature?: string;
  readonly head?: string;
  readonly note?: string | undefined;
}

// One line for the agent to act on.
export function describeCheckedRefusal(refusal: CheckedRefusal): string {
  const check = refusal.check ?? '';
  const feature = refusal.feature ?? '';
  const head = refusal.head ?? '';
  const note = refusal.note === undefined ? '' : ` (${refusal.note})`;

  return match(refusal.reason)
    .with(
      'no-forge',
      () =>
        'this server cannot read GitHub, so it records no check or verdict: record a test, a ci-run or a live-check',
    )
    .with(
      'no-pull-request',
      () => 'this item has no pull request yet: open one, then record the evidence again',
    )
    .with(
      'pull-request-closed',
      () => 'the pull request is closed or merged: boxxy records no check or verdict for it',
    )
    .with(
      'check-pending',
      () =>
        `check "${check}" is still running at ${head}: wait for it to finish, then record it again`,
    )
    .with(
      'check-failed',
      () => `check "${check}" did not pass at ${head}: fix it, push, and record it again`,
    )
    .with(
      'check-missing',
      () =>
        `no check run named "${check}" at ${head}: use the exact name of a CI check run, because a commit status does not count`,
    )
    .with(
      'verify-pending',
      () =>
        `the verify gate has not finished at ${head}: wait for it, then record the verdict again`,
    )
    .with(
      'verify-failed',
      () =>
        `the verify gate failed at ${head}${note}: fix the report, then record the verdict again`,
    )
    .with(
      'verdict-missing',
      () =>
        `the verify report at ${head} lists no verified feature "${feature}": run its journey and \`bun verify publish\`, then record the verdict again`,
    )
    .otherwise(() => `boxxy refused: ${refusal.reason}`);
}
