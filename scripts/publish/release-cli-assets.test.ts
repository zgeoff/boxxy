import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { createStubGH } from '../test-utils/create-stub-gh.ts';
import { writeTreeFiles } from '../test-utils/write-tree-files.ts';
import { releaseCLIAssets } from './release-cli-assets.ts';

interface StubBinaryAnswers {
  readonly version: string;
}

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-release-cli-assets-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const bin = join(directory, 'bin');
  const repo = join(directory, 'repo');
  const outDir = join(directory, 'out');
  const bunLog = join(directory, 'bun.log');

  await mkdir(bin);
  await mkdir(repo);
  await mkdir(outDir);
  await writeFile(bunLog, '');

  const gh = await createStubGH(bin);

  // bun stands in for the compile: it logs each call and writes a script that answers the checks
  // as the binary would, with the version the test gives.
  const createBun = async (answers: StubBinaryAnswers) => {
    await writeFile(
      join(bin, 'bun'),
      [
        '#!/usr/bin/env bash',
        `echo "bun $* token=\${GH_TOKEN:-none}" >> '${bunLog}'`,
        'while [ "$#" -gt 0 ]; do [ "$1" = --outfile ] && out="$2"; shift; done',
        'cat > "$out" <<EOF',
        '#!/usr/bin/env bash',
        String.raw`case "\$1" in`,
        `  --version) echo ${answers.version} ;;`,
        "  --help) echo 'usage: boxxy <command> [flags]' ;;",
        "  hook) echo 'error: BOXXY_URL is not set' >&2; exit 2 ;;",
        'esac',
        'EOF',
        'chmod +x "$out"',
        '',
      ].join('\n'),
    );

    await chmod(join(bin, 'bun'), 0o755);
  };

  const gitEnv = { cwd: repo, env: { PATH: process.env['PATH'], HOME: directory } };

  // Commits the CLI package, and makes GitHub answer that the release tag names that commit.
  const writeTaggedCLIPackage = async (version: string) => {
    await writeTreeFiles(repo, {
      'apps/cli/package.json': JSON.stringify({ name: '@boxxy/cli', version }),
      'apps/cli/hook-plugin/.claude-plugin/plugin.json': '{"name":"boxxy"}\n',
      'apps/cli/hook-plugin/hooks/hooks.json': '{"hooks":{}}\n',
    });

    await runCheckedCommand(runCommand, ['git', 'init', '--quiet'], gitEnv);
    await runCheckedCommand(runCommand, ['git', 'add', '.'], gitEnv);

    await runCheckedCommand(
      runCommand,
      ['git', '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'cli'],
      gitEnv,
    );

    const head = await runCheckedCommand(runCommand, ['git', 'rev-parse', 'HEAD'], gitEnv);

    await gh.writeResponses('commits', [{ sha: head.stdout.trim() }]);
  };

  const output: string[] = [];
  const errors: string[] = [];

  const runRelease = (paths: readonly string[], releasedVersions: string, modeText = '') =>
    releaseCLIAssets({
      modeText,
      cwd: repo,
      env: { PATH: `${bin}:${process.env['PATH']}`, HOME: directory, GH_TOKEN: 'test-token' },
      pathsText: JSON.stringify(paths),
      releasedVersionsText: releasedVersions,
      repository: 'zgeoff/boxxy',
      outDir,
      fileSystem: nodeFileSystem,
      runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
      writeError: (text) => {
        errors.push(text);
      },
    });

  const readBunCalls = async () => {
    const log = await readFile(bunLog, 'utf8');

    return log.split('\n').filter(Boolean);
  };

  return { outDir, gh, output, errors, createBun, writeTaggedCLIPackage, runRelease, readBunCalls };
}

test('it builds, checks and uploads the assets to the release of the CLI, checksums last', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.2.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');

  const exitCode = await ctx.runRelease(['apps/cli', 'libs/model'], '{"apps/cli":"0.2.0"}');
  const ghCalls = await ctx.gh.readCalls();

  expect(exitCode).toBe(0);
  expect(ctx.errors).toStrictEqual([]);

  expect(ghCalls).toStrictEqual([
    'api repos/zgeoff/boxxy/commits/%40boxxy%2Fcli%400.2.0',
    'release view @boxxy/cli@0.2.0 --repo zgeoff/boxxy --json assets',
    `release upload @boxxy/cli@0.2.0 ${join(ctx.outDir, 'boxxy-linux-x64')} ${join(ctx.outDir, 'boxxy-hook-plugin.tar.gz')} --repo zgeoff/boxxy --clobber`,
    `release upload @boxxy/cli@0.2.0 ${join(ctx.outDir, 'SHA256SUMS')} --repo zgeoff/boxxy --clobber`,
  ]);
});

test('it writes a checksum file that sha256sum checks in the asset folder', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.2.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');
  await ctx.runRelease(['apps/cli'], '', 'rehearse');

  const check = await runCommand(['sha256sum', '-c', 'SHA256SUMS'], {
    cwd: ctx.outDir,
    env: { PATH: process.env['PATH'] },
  });

  expect({ exitCode: check.exitCode, stdout: check.stdout }).toStrictEqual({
    exitCode: 0,
    stdout: 'boxxy-linux-x64: OK\nboxxy-hook-plugin.tar.gz: OK\n',
  });
});

test('it compiles the CLI entry for linux x64 and gives the compile no GitHub token', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.2.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');
  await ctx.runRelease(['apps/cli'], '{"apps/cli":"0.2.0"}');

  const bunCalls = await ctx.readBunCalls();

  expect(bunCalls).toStrictEqual([
    `bun build --compile --target=bun-linux-x64 src/main.ts --outfile ${join(ctx.outDir, 'boxxy-linux-x64')} token=none`,
  ]);
});

test('it leaves a release that holds the checksum file alone and builds nothing', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.2.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');

  await ctx.gh.writeResponses('releases', [
    {
      assets: [
        { name: 'boxxy-linux-x64', state: 'uploaded', size: 109_000_000 },
        { name: 'boxxy-hook-plugin.tar.gz', state: 'uploaded', size: 416 },
        { name: 'SHA256SUMS', state: 'uploaded', size: 173 },
      ],
    },
  ]);

  const exitCode = await ctx.runRelease(['apps/cli'], '{"apps/cli":"0.2.0"}');
  const bunCalls = await ctx.readBunCalls();
  const ghCalls = await ctx.gh.readCalls();

  expect(exitCode).toBe(0);

  expect(ctx.output).toStrictEqual([
    'skipping the CLI assets: @boxxy/cli@0.2.0 already holds SHA256SUMS\n',
  ]);

  expect(bunCalls).toStrictEqual([]);

  expect(ghCalls).toStrictEqual([
    'api repos/zgeoff/boxxy/commits/%40boxxy%2Fcli%400.2.0',
    'release view @boxxy/cli@0.2.0 --repo zgeoff/boxxy --json assets',
  ]);
});

test('it uploads the whole set again to a release that holds the binary but no checksum file', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.2.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');
  await ctx.gh.writeResponses('releases', [{ assets: [{ name: 'boxxy-linux-x64' }] }]);

  const exitCode = await ctx.runRelease(['apps/cli'], '{"apps/cli":"0.2.0"}');
  const ghCalls = await ctx.gh.readCalls();

  expect(exitCode).toBe(0);

  expect(ghCalls).toStrictEqual([
    'api repos/zgeoff/boxxy/commits/%40boxxy%2Fcli%400.2.0',
    'release view @boxxy/cli@0.2.0 --repo zgeoff/boxxy --json assets',
    `release upload @boxxy/cli@0.2.0 ${join(ctx.outDir, 'boxxy-linux-x64')} ${join(ctx.outDir, 'boxxy-hook-plugin.tar.gz')} --repo zgeoff/boxxy --clobber`,
    `release upload @boxxy/cli@0.2.0 ${join(ctx.outDir, 'SHA256SUMS')} --repo zgeoff/boxxy --clobber`,
  ]);
});

test('it fails with no build when the CLI release cannot be read', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.2.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');
  await ctx.gh.writeResponses('releases', ['error']);

  const exitCode = await ctx.runRelease(['apps/cli'], '{"apps/cli":"0.2.0"}');
  const bunCalls = await ctx.readBunCalls();

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    '::error::gh release view @boxxy/cli@0.2.0 failed, so the assets have no release to go to: HTTP 502\n',
  ]);

  expect(bunCalls).toStrictEqual([]);
});

test('it skips the assets and calls nothing when the release leaves the CLI out', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.2.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');

  const exitCode = await ctx.runRelease(['libs/model'], '{"libs/model":"0.2.0"}');
  const ghCalls = await ctx.gh.readCalls();

  expect(exitCode).toBe(0);

  expect(ctx.output).toStrictEqual([
    'skipping the CLI assets: the run does not release apps/cli\n',
  ]);

  expect(ghCalls).toStrictEqual([]);
});

test('it builds and checks the assets in a rehearsal and uploads nothing', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.2.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');

  const exitCode = await ctx.runRelease([], '', 'rehearse');
  const ghCalls = await ctx.gh.readCalls();

  expect(exitCode).toBe(0);

  expect(ctx.output).toStrictEqual([
    'built and checked boxxy-linux-x64, boxxy-hook-plugin.tar.gz and SHA256SUMS for 0.2.0\n',
  ]);

  expect(ghCalls).toStrictEqual([]);
});

test('it fails and uploads nothing when the binary prints another version', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.1.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');

  const exitCode = await ctx.runRelease(['apps/cli'], '{"apps/cli":"0.2.0"}');
  const ghCalls = await ctx.gh.readCalls();

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    '::error::boxxy-linux-x64 --version printed "0.1.0\\n", not "0.2.0\\n"\n',
  ]);

  expect(ghCalls).toStrictEqual([
    'api repos/zgeoff/boxxy/commits/%40boxxy%2Fcli%400.2.0',
    'release view @boxxy/cli@0.2.0 --repo zgeoff/boxxy --json assets',
  ]);
});

test('it refuses a released version that the CLI manifest does not hold', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.2.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');

  const exitCode = await ctx.runRelease(['apps/cli'], '{"apps/cli":"0.3.0"}');
  const ghCalls = await ctx.gh.readCalls();

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    '::error::the release tagged apps/cli at 0.3.0, but its package.json holds 0.2.0\n',
  ]);

  expect(ghCalls).toStrictEqual([]);
});

test('it compiles the real CLI into a binary that passes every check in a rehearsal', async () => {
  const ctx = await setupTest();

  const exitCode = await releaseCLIAssets({
    modeText: 'rehearse',
    cwd: join(import.meta.dir, '../..'),
    env: { PATH: process.env['PATH'], HOME: process.env['HOME'] },
    pathsText: '',
    releasedVersionsText: '',
    repository: 'zgeoff/boxxy',
    outDir: ctx.outDir,
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: () => {},
    writeError: (text) => {
      ctx.errors.push(text);
    },
  });

  expect({ exitCode, errors: ctx.errors }).toStrictEqual({ exitCode: 0, errors: [] });
});

test('it refuses with no build when the checkout is not the commit of the release tag', async () => {
  const ctx = await setupTest();

  await ctx.createBun({ version: '0.2.0' });
  await ctx.writeTaggedCLIPackage('0.2.0');
  await ctx.gh.writeResponses('commits', [{ sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' }]);

  const exitCode = await ctx.runRelease(['apps/cli'], '');
  const bunCalls = await ctx.readBunCalls();
  const ghCalls = await ctx.gh.readCalls();

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    expect.stringMatching(
      /^::error::the run checked out [0-9a-f]{40}, but @boxxy\/cli@0\.2\.0 is a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2; dispatch the run at the release tag\n$/u,
    ),
  ]);

  expect(bunCalls).toStrictEqual([]);
  expect(ghCalls).toStrictEqual(['api repos/zgeoff/boxxy/commits/%40boxxy%2Fcli%400.2.0']);
});
