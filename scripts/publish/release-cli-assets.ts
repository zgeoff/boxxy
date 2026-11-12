import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { match } from 'ts-pattern';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { collectBinaryFaults } from './collect-binary-faults.ts';
import { cliAssetNames, cliPackage } from './constants.ts';
import { createPluginTarball } from './create-plugin-tarball.ts';
import { formatChecksums } from './format-checksums.ts';
import { parsePackageManifest } from './parse-package-manifest.ts';
import type { PublishRequest } from './parse-publish-request.ts';
import { parsePublishRequest } from './parse-publish-request.ts';
import type { AssetUpload } from './pick-asset-upload.ts';
import { pickAssetUpload } from './pick-asset-upload.ts';
import { pickCLIAssetsStep } from './pick-cli-assets-step.ts';
import { pickSourceMatch } from './pick-source-match.ts';

export interface CLIAssetsReleaseOptions {
  readonly modeText: string;

  readonly cwd: string;

  // The step's environment, the GitHub token included; only the gh calls get all of it.
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly pathsText: string;

  readonly releasedVersionsText: string;

  readonly repository: string;

  // an empty folder that the assets are built in
  readonly outDir: string;

  readonly fileSystem: Pick<FileSystem, 'readText' | 'readBytes' | 'writeText'>;

  readonly runCommand: RunCommand;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

// Builds the CLI binary, the hook plug-in archive and their checksum file from the checked-out
// commit, checks that the binary runs, and attaches the three files to the CLI's GitHub release.
export function releaseCLIAssets(options: CLIAssetsReleaseOptions): Promise<number> {
  return match(parsePublishRequest(options))
    .with({ kind: 'refused' }, (refused) => {
      options.writeError(`::error::${refused.message}\n`);

      return Promise.resolve(1);
    })
    .with({ kind: 'parsed' }, (request) => releaseRequest(request, options))
    .exhaustive();
}

async function releaseRequest(
  request: Extract<PublishRequest, { readonly kind: 'parsed' }>,
  options: CLIAssetsReleaseOptions,
): Promise<number> {
  const packageFolder = join(options.cwd, cliPackage.path);

  const manifestText = await options.fileSystem.readText(join(packageFolder, 'package.json'));

  const step = pickCLIAssetsStep({
    mode: request.mode,
    paths: request.paths,
    manifest: parsePackageManifest(
      manifestText,
      cliPackage.path,
      request.releasedVersions[cliPackage.path],
    ),
  });

  if (step.kind === 'skip') {
    options.writeOutput(step.message);

    return 0;
  }

  if (step.kind === 'refused') {
    options.writeError(`::error::${step.message}\n`);

    return 1;
  }

  if (step.uploadTag !== null) {
    const upload = await readAssetUpload(step.uploadTag, options);

    if (upload.kind === 'invalid') {
      options.writeError(`::error::${upload.message}\n`);

      return 1;
    }

    if (upload.kind === 'complete') {
      options.writeOutput(
        `skipping the CLI assets: ${step.uploadTag} already holds ${cliAssetNames.checksums}\n`,
      );

      return 0;
    }
  }

  const assets = await writeAssets(packageFolder, options);
  const faults = await runBinaryChecks(step.version, assets.binaryPath, options);

  if (faults.length > 0) {
    for (const fault of faults) {
      options.writeError(`::error::${fault}\n`);
    }

    return 1;
  }

  options.writeOutput(
    `built and checked ${cliAssetNames.binary}, ${cliAssetNames.plugin} and ${cliAssetNames.checksums} for ${step.version}\n`,
  );

  if (step.uploadTag !== null) {
    await writeReleaseAssets(step.uploadTag, assets, options);
  }

  return 0;
}

async function readAssetUpload(
  tag: string,
  options: CLIAssetsReleaseOptions,
): Promise<AssetUpload> {
  const head = await runCheckedCommand(options.runCommand, ['git', 'rev-parse', 'HEAD'], {
    cwd: options.cwd,
    env: buildToolEnv(options.env),
  });

  const tagAnswer = await options.runCommand(
    ['gh', 'api', `repos/${options.repository}/commits/${encodeURIComponent(tag)}`],
    { cwd: options.cwd, env: options.env },
  );

  const source = pickSourceMatch({
    tag,
    headSHA: head.stdout,
    tagAnswerText: tagAnswer.exitCode === 0 ? tagAnswer.stdout : '',
  });

  if (source.kind === 'invalid') {
    return source;
  }

  const result = await options.runCommand(
    ['gh', 'release', 'view', tag, '--repo', options.repository, '--json', 'assets'],
    { cwd: options.cwd, env: options.env },
  );

  if (result.exitCode !== 0) {
    return {
      kind: 'invalid',
      message: `gh release view ${tag} failed, so the assets have no release to go to: ${result.stderr.trim()}`,
    };
  }

  return pickAssetUpload(result.stdout);
}

// The compile and the binary get no GitHub token and no BOXXY_URL.
function buildToolEnv(env: CLIAssetsReleaseOptions['env']): Record<string, string | undefined> {
  return { PATH: env['PATH'], HOME: env['HOME'] };
}

interface WrittenAssets {
  readonly binaryPath: string;

  readonly pluginPath: string;

  readonly checksumsPath: string;
}

async function writeAssets(
  packageFolder: string,
  options: CLIAssetsReleaseOptions,
): Promise<WrittenAssets> {
  const env = buildToolEnv(options.env);
  const binaryPath = join(options.outDir, cliAssetNames.binary);

  await runCheckedCommand(
    options.runCommand,
    [
      'bun',
      'build',
      '--compile',
      `--target=${cliPackage.compileTarget}`,
      cliPackage.entry,
      '--outfile',
      binaryPath,
    ],
    { cwd: packageFolder, env },
  );

  const pluginPath = await createPluginTarball({
    runCommand: options.runCommand,
    packageFolder,
    outDir: options.outDir,
    env,
  });

  const files = [
    { name: cliAssetNames.binary, path: binaryPath },
    { name: cliAssetNames.plugin, path: pluginPath },
  ];

  const checksums = await Promise.all(
    files.map(async (file) => {
      const bytes = await options.fileSystem.readBytes(file.path);

      return { name: file.name, sha256: createHash('sha256').update(bytes).digest('hex') };
    }),
  );

  const checksumsPath = join(options.outDir, cliAssetNames.checksums);

  await options.fileSystem.writeText(checksumsPath, formatChecksums(checksums));

  return { binaryPath, pluginPath, checksumsPath };
}

async function runBinaryChecks(
  version: string,
  binaryPath: string,
  options: CLIAssetsReleaseOptions,
): Promise<string[]> {
  const binaryOptions = { cwd: options.outDir, env: buildToolEnv(options.env) };

  const versionRun = await options.runCommand([binaryPath, '--version'], binaryOptions);
  const helpRun = await options.runCommand([binaryPath, '--help'], binaryOptions);

  const hookRun = await options.runCommand([binaryPath, 'hook', 'session-start'], {
    ...binaryOptions,
    stdin: '{}',
  });

  const checksumRun = await options.runCommand(
    ['sha256sum', '-c', cliAssetNames.checksums],
    binaryOptions,
  );

  return collectBinaryFaults({ version, versionRun, helpRun, hookRun, checksumRun });
}

// The checksum file goes up last: a release that holds it holds the whole set.
async function writeReleaseAssets(
  tag: string,
  assets: WrittenAssets,
  options: CLIAssetsReleaseOptions,
): Promise<void> {
  const ghOptions = { cwd: options.cwd, env: options.env };
  const repo = ['--repo', options.repository, '--clobber'];

  await runCheckedCommand(
    options.runCommand,
    ['gh', 'release', 'upload', tag, assets.binaryPath, assets.pluginPath, ...repo],
    ghOptions,
  );

  await runCheckedCommand(
    options.runCommand,
    ['gh', 'release', 'upload', tag, assets.checksumsPath, ...repo],
    ghOptions,
  );

  options.writeOutput(`uploaded the CLI assets to ${tag}\n`);
}

if (import.meta.main) {
  const outDir = await mkdtemp(join(tmpdir(), 'boxxy-cli-assets-'));

  process.exitCode = await releaseCLIAssets({
    modeText: process.env['PUBLISH_MODE'] ?? '',
    cwd: process.cwd(),
    env: process.env,
    pathsText: process.env['PATHS_RELEASED'] ?? '',
    releasedVersionsText: process.env['RELEASED_VERSIONS'] ?? '',
    repository: process.env['GITHUB_REPOSITORY'] ?? '',
    outDir,
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}
