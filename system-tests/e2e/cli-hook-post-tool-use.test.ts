import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';

async function setupTest() {
  const cli = await createTestCLI();

  const repo = brandSchemas.repoName.parse('example/app');
  const url = 'https://github.com/example/app/pull/7';

  const attempt = await cli.server.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  cli.server.callerProof.setCaller(attempt.caller);

  cli.server.forge.seed({
    ref: { repo, number: 7 },
    githubId: 9_000_007,
    reading: { state: 'open', mergedAt: null, mergeCommit: null, commits: [] },
  });

  const createPullRequest = (command: string, stdout: string) =>
    cli.run(['hook', 'post-tool-use'], {
      stdin: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command },
        tool_response: { stdout, stderr: '', interrupted: false, isImage: false },
      }),
    });

  return {
    ...cli,
    attempt,
    url,
    createPullRequest,
    readWatched: () => cli.server.deps.store.read((tx) => tx.listWatchedPullRequests()),
  };
}

test('it links the pull request that gh pr create printed', async () => {
  const ctx = await setupTest();
  const result = await ctx.createPullRequest('gh pr create --fill', `${ctx.url}\n`);
  const watched = await ctx.readWatched();

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: 'boxxy linked example/app#7 to this attempt\n',
    stderr: '',
  });

  expect(watched.map((row) => row.attempt)).toStrictEqual([ctx.attempt.id]);
});

test('it says that boxxy links the pull request later when the forge does not answer', async () => {
  const ctx = await setupTest();

  ctx.server.forge.setDown(true);

  const result = await ctx.createPullRequest('gh pr create --fill', `${ctx.url}\n`);
  const watched = await ctx.readWatched();

  expect({ exitCode: result.exitCode, stdout: result.stdout, watched }).toStrictEqual({
    exitCode: 0,
    stdout: 'boxxy could not read the pull request now and links it later\n',
    watched: [],
  });
});

test('it exits 2 so that Claude Code tells the agent when another item holds the pull request', async () => {
  const ctx = await setupTest();
  const other = await ctx.server.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  ctx.server.callerProof.setCaller(other.caller);

  await ctx.createPullRequest('gh pr create --fill', `${ctx.url}\n`);

  ctx.server.callerProof.setCaller(ctx.attempt.caller);

  const result = await ctx.createPullRequest('gh pr create --fill', `${ctx.url}\n`);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'boxxy refused: this pull request belongs to another item\n',
  });
});

test('it reads the server and the forge not at all for a Bash call that is not gh pr create', async () => {
  const ctx = await setupTest();
  const result = await ctx.createPullRequest('gh pr view 7', `${ctx.url}\n`);

  expect({ result, calls: ctx.server.forge.calls, slept: ctx.slept }).toStrictEqual({
    result: { exitCode: 0, stdout: '', stderr: '' },
    calls: [],
    slept: [],
  });
});

test('it does nothing for a gh pr create call that printed no pull request URL', async () => {
  const ctx = await setupTest();

  const result = await ctx.createPullRequest(
    'gh pr create --fill',
    'a pull request already exists\n',
  );

  expect(result).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it exits 2 when the hook payload is not JSON', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['hook', 'post-tool-use'], { stdin: 'not json' });

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'error: the hook payload on stdin is not JSON\n',
  });
});
