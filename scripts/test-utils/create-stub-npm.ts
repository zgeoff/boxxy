import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface StubNPMAnswer {
  readonly output?: string;

  readonly errorOutput?: string;

  readonly exitCode?: number;

  // A file the subcommand writes the file list of the tarball its first argument names to.
  readonly tarballListPath?: string;
}

// Writes a stand-in for npm that logs each call and answers it from `answers`. A key such as
// `view dist-tags.latest` names a subcommand and its third argument, and wins over `view`.
export async function createStubNPM(
  directory: string,
  log: string,
  answers: Readonly<Record<string, StubNPMAnswer>> = {},
): Promise<void> {
  const cases = await Promise.all(
    Object.entries(answers).map(async ([key, answer]) => {
      const fileName = key.replaceAll(' ', '-');
      const outputPath = join(directory, `npm-${fileName}.output`);
      const errorPath = join(directory, `npm-${fileName}.error`);

      await writeFile(outputPath, answer.output ?? '');
      await writeFile(errorPath, answer.errorOutput ?? '');

      const listing =
        answer.tarballListPath === undefined ? '' : `tar -tzf "$2" > '${answer.tarballListPath}'; `;

      return {
        isField: key.includes(' '),
        line: `  '${key}') ${listing}cat '${outputPath}'; cat '${errorPath}' >&2; exit ${answer.exitCode ?? 0} ;;`,
      };
    }),
  );

  const path = join(directory, 'npm');

  await writeFile(
    path,
    [
      '#!/bin/sh',
      `echo "npm $*" >> '${log}'`,
      'case "$1 $3" in',
      ...cases.filter((entry) => entry.isField).map((entry) => entry.line),
      'esac',
      'case "$1" in',
      ...cases.filter((entry) => !entry.isField).map((entry) => entry.line),
      'esac',
      '',
    ].join('\n'),
  );

  await chmod(path, 0o755);
}
