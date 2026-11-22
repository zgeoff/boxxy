import type { CloseOutProblem, NoHeadCause } from '@boxxy/model';
import { match } from 'ts-pattern';

// One line for the agent to act on. The server lists every problem at once.
export function describeCloseOutProblem(problem: CloseOutProblem): string {
  return match(problem)
    .with(
      { kind: 'schema' },
      (found) => `${found.path === '' ? '(body)' : found.path}: ${found.message}`,
    )
    .with({ kind: 'unknown-criterion' }, (found) => `unknown criterion ${found.criterion}`)
    .with(
      { kind: 'foreign-evidence' },
      (found) => `evidence ${found.evidence} belongs to another attempt`,
    )
    .with(
      { kind: 'built-without-evidence' },
      (found) => `built criteria with no evidence: ${found.criteria.join(', ')}`,
    )
    .with({ kind: 'stale-evidence' }, (found) => {
      const recorded = `evidence ${found.evidence} for criterion ${found.criterion} was recorded at ${found.recordedAt}`;

      return found.head === null
        ? `${recorded}, but ${describeNoHeadCause(found.cause)}`
        : `${recorded}, and the pull request head is now ${found.head}: record the check or verdict again, and cite the new evidence`;
    })
    .with({ kind: 'no-acceptance' }, () => 'the close-out lists no acceptance criterion')
    .with({ kind: 'unknown-item' }, (found) => `unknown item ${found.item}`)
    .with({ kind: 'unknown-kind' }, (found) => `unknown item kind ${found.itemKind}`)
    .with(
      { kind: 'unknown-criterion-tag' },
      (found) => `unknown criterion tag ${found.tag}: the rules file does not list it`,
    )
    .with(
      { kind: 'refused-relation' },
      (found) => `relation ${found.type} to ${found.target} refused: ${found.reason}`,
    )
    .with({ kind: 'phase-rule' }, (found) => found.message)
    .with(
      { kind: 'too-large' },
      (found) => `the close-out is ${found.bytes} bytes as stored; the limit is ${found.max}`,
    )
    .exhaustive();
}

function describeNoHeadCause(cause: NoHeadCause | null): string {
  return match(cause)
    .with(
      'no-forge',
      () => 'the server has no GitHub config, so it cannot read a pull request head',
    )
    .with('no-pull-request', () => 'the item has no linked pull request')
    .with('not-found', () => 'GitHub no longer finds the pull request')
    .with('closed', () => 'the pull request is closed or merged')
    .with(null, () => 'the pull request is closed or merged')
    .exhaustive();
}
