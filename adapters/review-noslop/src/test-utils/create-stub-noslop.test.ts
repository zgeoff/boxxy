import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubNoslop } from './create-stub-noslop.ts';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'boxxy-stub-noslop-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const runIn = async (binPath: string, argv: string[]) => {
    const child = Bun.spawn(argv, {
      cwd: root,
      stdout: 'pipe',
      env: { PATH: `${binPath}:${process.env['PATH'] ?? ''}` },
    });

    return { exitCode: await child.exited, stdout: await new Response(child.stdout).text() };
  };

  return { root, runIn };
}

test('it answers each noslop call with its answer, and records the arguments', async () => {
  const ctx = await setupTest();

  const stub = await createStubNoslop(ctx.root, {
    full: '{"run":"full"}',
    fixesOnly: null,
    plain: '{"run":"plain"}',
    findings: { stdout: '{"findings":[]}', exitCode: 1 },
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
  });

  const answers = [
    await ctx.runIn(stub.binPath, ['noslop', 'review', '--full', '--pr', '7']),
    await ctx.runIn(stub.binPath, ['noslop', 'review', '--fixes-only', '--pr', '7']),
    await ctx.runIn(stub.binPath, ['noslop', 'review', '--pr', '7']),
    await ctx.runIn(stub.binPath, ['noslop', 'findings', '--pr', '7']),
    await ctx.runIn(stub.binPath, ['git', 'rev-parse', 'HEAD']),
  ];

  expect([answers, await stub.readCalls()]).toStrictEqual([
    [
      { exitCode: 0, stdout: '{"run":"full"}' },
      { exitCode: 0, stdout: '' },
      { exitCode: 0, stdout: '{"run":"plain"}' },
      { exitCode: 1, stdout: '{"findings":[]}' },
      { exitCode: 0, stdout: 'e83c5163316f89bfbde7d9ab23ca2e25604af290\n' },
    ],
    ['review --full --pr 7', 'review --fixes-only --pr 7', 'review --pr 7', 'findings --pr 7'],
  ]);
});
