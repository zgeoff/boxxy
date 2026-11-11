import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import type { CloseOutProblem } from '@boxxy/model';
import { describeCloseOutProblem } from './describe-close-out-problem.ts';

test.each<{ problem: CloseOutProblem; line: string }>([
  {
    problem: { kind: 'schema', path: 'result.kind', message: 'Invalid option' },
    line: 'result.kind: Invalid option',
  },
  {
    problem: { kind: 'schema', path: '', message: 'Expected object' },
    line: '(body): Expected object',
  },
  {
    problem: { kind: 'unknown-criterion', criterion: brandSchemas.criterionId.parse('a1') },
    line: 'unknown criterion a1',
  },
  {
    problem: { kind: 'built-without-evidence', criteria: [brandSchemas.criterionId.parse('a1')] },
    line: 'built criteria with no evidence: a1',
  },
  { problem: { kind: 'no-acceptance' }, line: 'the close-out lists no acceptance criterion' },
  { problem: { kind: 'unknown-item', item: 'i-9' }, line: 'unknown item i-9' },
  { problem: { kind: 'unknown-kind', itemKind: 'epic' }, line: 'unknown item kind epic' },
  {
    problem: { kind: 'refused-relation', type: 'blocks', target: 'i-2', reason: 'self' },
    line: 'relation blocks to i-2 refused: self',
  },
  {
    problem: { kind: 'phase-rule', message: 'a finding needs a title' },
    line: 'a finding needs a title',
  },
  {
    problem: { kind: 'too-large', bytes: 130_000, max: 120_000 },
    line: 'the close-out is 130000 bytes as stored; the limit is 120000',
  },
])('it describes a problem of kind $problem.kind', (row) => {
  expect(describeCloseOutProblem(row.problem)).toBe(row.line);
});
