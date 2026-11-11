import type { CloseOutProblem } from '@boxxy/model';
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
    .with({ kind: 'no-acceptance' }, () => 'the close-out lists no acceptance criterion')
    .with({ kind: 'unknown-item' }, (found) => `unknown item ${found.item}`)
    .with({ kind: 'unknown-kind' }, (found) => `unknown item kind ${found.itemKind}`)
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
