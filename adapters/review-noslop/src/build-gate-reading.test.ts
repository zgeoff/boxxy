import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import type { FindingList } from '@noslop/cli';
import type { PullRequestCheck } from '@noslop/cli/check';
import { buildGateReading } from './build-gate-reading.ts';
import { buildMockReviewResult } from './test-utils/build-mock-review-result.ts';

interface ReadingCase {
  readonly failedCalls: number;
  readonly list: FindingList | null;
  readonly outcome: PullRequestCheck;
}

function setupTest() {
  return {
    read: (input: ReadingCase) =>
      buildGateReading({
        round: {
          attempt: brandSchemas.attemptId.parse('01890a5d-ac96-774b-bcce-b302099a8057'),
          pullRequest: { repo: brandSchemas.repoName.parse('example/app'), number: 7 },
          round: 2,
          cause: 'rework',
        },
        head: brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290'),
        review: buildMockReviewResult({
          owner: 'example',
          repo: 'app',
          number: 7,
          findings: [{ id: '00000000000000a1', severity: 'P2', path: 'src/menu.ts' }],
          failedCalls: input.failedCalls,
        }),
        list: input.list,
        outcome: input.outcome,
      }),
  };
}

test.each([
  {
    title: 'an open finding with no findings list as open-findings',
    failedCalls: 0,
    list: null,
    outcome: {
      conclusion: 'failure',
      title: '',
      summary: '',
      open: [{ id: '00000000000000a1', title: '', reason: '' }],
    },
    expected: { status: 'blocked', why: 'open-findings' },
  },
  {
    title: 'a check success with no findings list as passed',
    failedCalls: 0,
    list: null,
    outcome: { conclusion: 'success', title: '', summary: '', open: [] },
    expected: { status: 'passed' },
  },
  {
    title: 'a failed call before an open finding as failed-call',
    failedCalls: 1,
    list: { findings: [] },
    outcome: {
      conclusion: 'failure',
      title: '',
      summary: '',
      open: [{ id: '00000000000000a1', title: '', reason: '' }],
    },
    expected: { status: 'blocked', why: 'failed-call' },
  },
  {
    title: 'an open finding as open-findings',
    failedCalls: 0,
    list: { findings: [] },
    outcome: {
      conclusion: 'failure',
      title: '',
      summary: '',
      open: [{ id: '00000000000000a1', title: '', reason: '' }],
    },
    expected: { status: 'blocked', why: 'open-findings' },
  },
  {
    title: 'a check failure with no open finding as unreadable',
    failedCalls: 0,
    list: { findings: [] },
    outcome: { conclusion: 'failure', title: '', summary: '', open: [] },
    expected: { status: 'blocked', why: 'unreadable' },
  },
  {
    title: 'a check success with no open finding as passed',
    failedCalls: 0,
    list: { findings: [] },
    outcome: { conclusion: 'success', title: '', summary: '', open: [] },
    expected: { status: 'passed' },
  },
] satisfies {
  title: string;
  failedCalls: number;
  list: FindingList | null;
  outcome: PullRequestCheck;
  expected: object;
}[])('it reads $title', (row) => {
  const ctx = setupTest();
  const reading = ctx.read(row);

  expect(reading).toStrictEqual(expect.objectContaining(row.expected));
});

test('it counts the open findings by severity from the result and the list, and their paths', () => {
  const ctx = setupTest();

  const reading = ctx.read({
    failedCalls: 0,
    list: {
      findings: [
        {
          id: '00000000000000b1',
          path: 'src/theme.ts',
          severity: 'P1',
          state: 'open',
          author: null,
          reason: null,
          unjudged: false,
        },
        {
          id: '00000000000000b2',
          path: 'src/theme.ts',
          severity: 'P3',
          state: 'open',
          author: null,
          reason: null,
          unjudged: false,
        },
        {
          id: '00000000000000b3',
          path: 'docs/theme.md',
          severity: 'P3',
          state: 'deferred',
          author: 'dev',
          reason: 'later',
          unjudged: false,
        },
        {
          id: '00000000000000b4',
          path: 'src/old.ts',
          severity: 'P2',
          state: 'not-a-defect',
          author: 'dev',
          reason: 'intended',
          unjudged: false,
        },
        {
          id: '00000000000000b5',
          path: 'src/menu.ts',
          severity: 'P2',
          state: 'fixed',
          author: 'dev',
          reason: null,
          unjudged: false,
        },
      ],
    },
    outcome: {
      conclusion: 'failure',
      title: '',
      summary: '',
      open: [
        { id: '00000000000000a1', title: '', reason: '' },
        { id: '00000000000000b1', title: '', reason: '' },
        { id: '00000000000000b2', title: '', reason: '' },
        { id: '00000000000000c9', title: '', reason: '' },
      ],
    },
  });

  expect(reading).toStrictEqual(
    expect.objectContaining({
      open: { high: 2, medium: 1, low: 1 },
      closedWithoutFix: 2,
      findingPaths: ['src/menu.ts', 'src/theme.ts'],
    }),
  );
});

test('it counts an open finding that only an earlier round named as high, when it has no list', () => {
  const ctx = setupTest();

  const reading = ctx.read({
    failedCalls: 0,
    list: null,
    outcome: {
      conclusion: 'failure',
      title: '',
      summary: '',
      open: [
        { id: '00000000000000a1', title: '', reason: '' },
        { id: '00000000000000c9', title: '', reason: '' },
      ],
    },
  });

  expect(reading).toStrictEqual(
    expect.objectContaining({
      status: 'blocked',
      why: 'open-findings',
      open: { high: 1, medium: 1, low: 0 },
      closedWithoutFix: 0,
      findingPaths: ['src/menu.ts'],
    }),
  );
});
