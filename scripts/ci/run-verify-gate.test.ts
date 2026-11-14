import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { buildReportBody } from '../test-utils/build-report-body.ts';
import { writeTreeFiles } from '../test-utils/write-tree-files.ts';
import { findField } from './find-field.ts';
import { runCheckedCommand } from './run-checked-command.ts';
import { runCommand } from './run-command.ts';
import { runVerifyGate } from './run-verify-gate.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-verify-gate-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repo = join(directory, 'repo');
  const runnerTemp = join(directory, 'runner-temp');
  const eventPath = join(directory, 'event.json');
  const scriptPath = join(import.meta.dir, 'run-verify-gate.ts');
  const verifyPath = join(import.meta.dir, '../../apps/cli/src/test-utils/verify/verify.ts');

  await mkdir(runnerTemp);

  const older = '0'.repeat(40);

  // the features that a change under `apps/cli` maps to
  const featureNames = [
    'file-item',
    'claim-settle',
    'report-cost',
    'plan-ordering',
    'runner-pause',
    'hold-notice',
    'hold-recovery',
  ];

  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  const runGit = (args: readonly string[]) =>
    runCheckedCommand(runCommand, ['git', '-c', 'commit.gpgsign=false', ...args], {
      cwd: repo,
      env,
    });

  // The fixture's `verify` script runs boxxy's verify CLI, so the gate reads boxxy's real map of
  // paths to features against the fixture's history. `origin/main` names the base commit.
  await writeTreeFiles(repo, {
    'package.json': JSON.stringify({
      name: 'gate-fixture',
      scripts: { verify: `bun ${verifyPath}` },
    }),
    'README.md': '# Fixture\n',
    'bun.lock': '{ "lockfileVersion": 1 }\n',
    'apps/cli/src/main.ts': "console.log('boxxy');\n",
  });

  await runGit(['init', '--quiet']);
  await runGit(['add', '.']);
  await runGit(['commit', '--quiet', '--message', 'base']);
  await runGit(['update-ref', 'refs/remotes/origin/main', 'HEAD']);

  const commitChange = async (files: Readonly<Record<string, string>>) => {
    await writeTreeFiles(repo, files);
    await runGit(['add', '.']);
    await runGit(['commit', '--quiet', '--message', 'change']);
  };

  // A report whose claims all sit at the zero fingerprint fails the gate as stale, and the failure
  // names each feature's own fingerprint in the tree.
  const readFingerprints = async () => {
    const claimed = buildReportBody({
      fingerprint: older,
      featureFingerprints: Object.fromEntries(featureNames.map((name) => [name, older])),
    });

    const bodyFile = join(runnerTemp, 'probe-body.md');

    await writeFile(bodyFile, claimed);

    const result = await $`bun verify gate --base origin/main --body-file ${bodyFile}`
      .cwd(repo)
      .env(env)
      .nothrow()
      .quiet();

    const data = findField(JSON.parse(result.stdout.toString()), 'data');
    const failing = findField(data, 'failing');
    const featureFingerprints: Record<string, string> = {};

    for (const failure of Array.isArray(failing) ? failing : []) {
      const reason = String(findField(failure, 'reason'));

      featureFingerprints[String(findField(failure, 'name'))] = reason.slice(
        reason.indexOf('tree at ') + 'tree at '.length,
      );
    }

    return {
      fingerprint: String(findField(data, 'fingerprint')),
      featureFingerprints,
    };
  };

  // Writes the event GitHub writes for a pull request into main, then runs the step's script.
  const runGate = async (body: string | null) => {
    await writeFile(eventPath, JSON.stringify({ pull_request: { body, base: { ref: 'main' } } }));

    const result = await $`bun ${scriptPath}`
      .cwd(repo)
      .env({ ...env, GITHUB_EVENT_PATH: eventPath, RUNNER_TEMP: runnerTemp })
      .nothrow()
      .quiet();

    const annotations = result.stdout
      .toString()
      .split('\n')
      .filter((line) => line.startsWith('::error'));

    return { exitCode: result.exitCode, annotations };
  };

  return { commitChange, featureNames, older, readFingerprints, runGate };
}

test('it fails a change to a mapped path when the body holds no report', async () => {
  const ctx = await setupTest();

  await ctx.commitChange({ 'apps/cli/src/main.ts': "console.log('boxxy, changed');\n" });

  const gate = await ctx.runGate(null);

  expect(gate).toStrictEqual({
    exitCode: 1,
    annotations: ctx.featureNames.map(
      (name) => `::error title=verify gate::${name}: The PR body holds no wringer data comment.`,
    ),
  });
});

test('it passes a change to a mapped path when the report holds a verdict of each feature at the fingerprint', async () => {
  const ctx = await setupTest();

  await ctx.commitChange({ 'apps/cli/src/main.ts': "console.log('boxxy, changed');\n" });

  const fingerprints = await ctx.readFingerprints();

  const body = buildReportBody(fingerprints);

  const gate = await ctx.runGate(body);

  expect(gate).toStrictEqual({ exitCode: 0, annotations: [] });
});

test('it fails a change to a mapped path when the report holds claims at an older fingerprint', async () => {
  const ctx = await setupTest();

  await ctx.commitChange({ 'apps/cli/src/main.ts': "console.log('boxxy, changed');\n" });

  const tree = await ctx.readFingerprints();

  const body = buildReportBody({
    fingerprint: ctx.older,
    featureFingerprints: { 'file-item': ctx.older, 'claim-settle': ctx.older },
  });

  const gate = await ctx.runGate(body);

  expect(gate).toStrictEqual({
    exitCode: 1,
    annotations: ctx.featureNames.map((name) =>
      name === 'file-item' || name === 'claim-settle'
        ? `::error title=verify gate::${name}: verdict at ${ctx.older}, tree at ${tree.featureFingerprints[name]}`
        : `::error title=verify gate::${name}: no claim in the data comment`,
    ),
  });
});

test('it fails a change to a path that no feature maps and no ignore glob matches', async () => {
  const ctx = await setupTest();

  await ctx.commitChange({ 'tools/new-thing/index.ts': 'export const thing = 1;\n' });

  const gate = await ctx.runGate(null);

  expect(gate).toStrictEqual({
    exitCode: 1,
    annotations: [
      '::error title=verify gate::tools/new-thing/index.ts: no feature maps this path, and no ignore glob matches it',
    ],
  });
});

test('it passes a change to only a README with no report', async () => {
  const ctx = await setupTest();

  await ctx.commitChange({ 'README.md': '# Fixture\n\nA new paragraph.\n' });

  const gate = await ctx.runGate(null);

  expect(gate).toStrictEqual({ exitCode: 0, annotations: [] });
});

test('it passes a change to only the lock file with no report', async () => {
  const ctx = await setupTest();

  await ctx.commitChange({ 'bun.lock': '{ "lockfileVersion": 1, "workspaces": {} }\n' });

  const gate = await ctx.runGate(null);

  expect(gate).toStrictEqual({ exitCode: 0, annotations: [] });
});

test('it refuses a run whose environment names no event file', async () => {
  const output: string[] = [];
  const errors: string[] = [];

  const exitCode = await runVerifyGate({
    cwd: '/tmp/boxxy-test',
    env: { PATH: process.env['PATH'] },
    runCommand,
    writeOutput: (text) => {
      output.push(text);
    },
    writeError: (text) => {
      errors.push(text);
    },
  });

  expect({ exitCode, output, errors }).toStrictEqual({
    exitCode: 1,
    output: [],
    errors: ['::error::set GITHUB_EVENT_PATH and RUNNER_TEMP; a pull_request run sets both\n'],
  });
});
