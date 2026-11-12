import type { CommandResult } from '../ci/run-command.ts';
import { cliAssetNames } from './constants.ts';

export interface BinaryRuns {
  // the version the CLI's package.json holds at the built commit
  readonly version: string;

  readonly versionRun: CommandResult;

  readonly helpRun: CommandResult;

  // `hook session-start` with no BOXXY_URL, which the CLI refuses before it reads stdin
  readonly hookRun: CommandResult;

  readonly checksumRun: CommandResult;
}

const helpStart = 'usage: boxxy ';
const missingURLError = 'error: BOXXY_URL is not set\n';

// A compiled binary can start and still be broken, such as a bundle that lost a JSON import, so
// each check compares the output as well as the exit code.
export function collectBinaryFaults(runs: BinaryRuns): string[] {
  const binary = cliAssetNames.binary;
  const faults: string[] = [];

  if (runs.versionRun.stdout !== `${runs.version}\n`) {
    faults.push(
      `${binary} --version printed ${JSON.stringify(runs.versionRun.stdout)}, not ${JSON.stringify(`${runs.version}\n`)}`,
    );
  } else if (runs.versionRun.exitCode !== 0) {
    faults.push(`${binary} --version exited ${runs.versionRun.exitCode}, not 0`);
  }

  if (runs.helpRun.exitCode !== 0 || !runs.helpRun.stdout.startsWith(helpStart)) {
    faults.push(
      `${binary} --help exited ${runs.helpRun.exitCode}, not 0 with the usage line: ${runs.helpRun.stderr.trim()}`,
    );
  }

  if (runs.hookRun.exitCode !== 2 || runs.hookRun.stderr !== missingURLError) {
    faults.push(
      `${binary} hook session-start with no BOXXY_URL exited ${runs.hookRun.exitCode}, not 2 with "${missingURLError.trim()}": ${runs.hookRun.stderr.trim()}`,
    );
  }

  if (runs.checksumRun.exitCode !== 0) {
    faults.push(
      `sha256sum -c ${cliAssetNames.checksums} exited ${runs.checksumRun.exitCode}: ${`${runs.checksumRun.stdout}${runs.checksumRun.stderr}`.trim()}`,
    );
  }

  return faults;
}
