import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GateRound } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { z } from 'zod';
import { buildReviewCommand, reviewFileName } from './build-review-command.ts';
import { buildMockReviewResult } from './test-utils/build-mock-review-result.ts';
import type { StubNoslopAnswers } from './test-utils/create-stub-noslop.ts';
import { createStubNoslop } from './test-utils/create-stub-noslop.ts';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'boxxy-review-command-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const runCommand = async (command: string, answers: StubNoslopAnswers) => {
    const stub = await createStubNoslop(root, answers);

    const child = Bun.spawn(['sh', '-c', command], {
      cwd: root,
      stdout: 'ignore',
      env: { PATH: `${stub.binPath}:${process.env['PATH'] ?? ''}` },
    });

    const exitCode = await child.exited;
    const text = await readFile(join(root, reviewFileName), 'utf8');

    const body = z.looseObject({ review: z.unknown() }).parse(JSON.parse(text));

    return { exitCode, calls: await stub.readCalls(), body };
  };

  return { runCommand };
}

test('it runs a full review in the first round, and writes it with the findings and the head', async () => {
  const ctx = await setupTest();

  const round: GateRound = {
    attempt: brandSchemas.attemptId.parse('01890a5d-ac96-774b-bcce-b302099a8057'),
    pullRequest: { repo: brandSchemas.repoName.parse('example/app'), number: 7 },
    round: 1,
    cause: 'first',
  };

  const review = buildMockReviewResult({ owner: 'example', repo: 'app', number: 7 });

  const run = await ctx.runCommand(buildReviewCommand(round), {
    full: JSON.stringify(review),
    fixesOnly: null,
    plain: null,
    findings: { stdout: '{"findings":[]}', exitCode: 0 },
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
  });

  expect(run).toStrictEqual({
    exitCode: 0,
    calls: [
      `review --full --pr 7 --repo example/app --adapter claude --report json --json`,
      'findings --pr 7 --repo example/app --json',
    ],
    body: {
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      review,
      findings: { exitCode: 0, list: { findings: [] } },
    },
  });
});

test.each(['rework', 'recheck'] as const)(
  'it keeps the fixes-only review of a %s round that judged a fix',
  async (cause) => {
    const ctx = await setupTest();

    const round: GateRound = {
      attempt: brandSchemas.attemptId.parse('01890a5d-ac96-774b-bcce-b302099a8058'),
      pullRequest: { repo: brandSchemas.repoName.parse('example/app'), number: 7 },
      round: 2,
      cause,
    };

    const review = buildMockReviewResult({
      owner: 'example',
      repo: 'app',
      number: 7,
      fixesOnly: { fixChecks: [{ findingID: '00000000000000f1', fixed: true }] },
    });

    const run = await ctx.runCommand(buildReviewCommand(round), {
      full: null,
      fixesOnly: JSON.stringify(review),
      plain: null,
      findings: { stdout: '{"findings":[]}', exitCode: 0 },
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    });

    expect([run.calls, run.body.review]).toStrictEqual([
      [
        `review --fixes-only --pr 7 --repo example/app --adapter claude --report json --json`,
        'findings --pr 7 --repo example/app --json',
      ],
      review,
    ]);
  },
);

test('it runs a plain review after a fixes-only review that judged no fix, and keeps the plain one', async () => {
  const ctx = await setupTest();

  const round: GateRound = {
    attempt: brandSchemas.attemptId.parse('01890a5d-ac96-774b-bcce-b302099a8058'),
    pullRequest: { repo: brandSchemas.repoName.parse('example/app'), number: 7 },
    round: 2,
    cause: 'rework',
  };

  const plain = buildMockReviewResult({ owner: 'example', repo: 'app', number: 7 });

  const run = await ctx.runCommand(buildReviewCommand(round), {
    full: null,
    fixesOnly: JSON.stringify(
      buildMockReviewResult({
        owner: 'example',
        repo: 'app',
        number: 7,
        fixesOnly: { fixChecks: [] },
      }),
    ),
    plain: JSON.stringify(plain),
    findings: { stdout: '{"findings":[]}', exitCode: 0 },
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
  });

  expect([run.calls, run.body.review]).toStrictEqual([
    [
      `review --fixes-only --pr 7 --repo example/app --adapter claude --report json --json`,
      `review --pr 7 --repo example/app --adapter claude --report json --json`,
      'findings --pr 7 --repo example/app --json',
    ],
    plain,
  ]);
});

test('it writes a null review and the findings exit code when noslop prints nothing', async () => {
  const ctx = await setupTest();

  const round: GateRound = {
    attempt: brandSchemas.attemptId.parse('01890a5d-ac96-774b-bcce-b302099a8057'),
    pullRequest: { repo: brandSchemas.repoName.parse('example/app'), number: 7 },
    round: 1,
    cause: 'first',
  };

  const run = await ctx.runCommand(buildReviewCommand(round), {
    full: null,
    fixesOnly: null,
    plain: null,
    findings: { stdout: '', exitCode: 1 },
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
  });

  expect(run.body).toStrictEqual({
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    review: null,
    findings: { exitCode: 1, list: null },
  });
});
