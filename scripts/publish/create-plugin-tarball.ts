import { join } from 'node:path';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { cliAssetNames, cliPackage } from './constants.ts';

export interface PluginTarballOptions {
  readonly runCommand: RunCommand;

  // the CLI package folder, which holds the plug-in folder
  readonly packageFolder: string;

  readonly outDir: string;

  readonly env: Readonly<Record<string, string | undefined>>;
}

// A checkout sets each file's time to the checkout's and its mode from the umask, so the archive
// fixes the order, the times, the owner and the modes, and gzip leaves out its own name and time.
// The same files then give the same checksum on every run. The flags are GNU tar's.
export async function createPluginTarball(options: PluginTarballOptions): Promise<string> {
  const tarPath = join(options.outDir, cliAssetNames.plugin.replace(/\.gz$/u, ''));
  const commandOptions = { cwd: options.packageFolder, env: options.env };

  await runCheckedCommand(
    options.runCommand,
    [
      'tar',
      '--create',
      '--format=ustar',
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--mode=u=rwX,go=rX',
      `--file=${tarPath}`,
      cliPackage.pluginFolder,
    ],
    commandOptions,
  );

  await runCheckedCommand(options.runCommand, ['gzip', '-n', '-9', '-f', tarPath], commandOptions);

  return `${tarPath}.gz`;
}
