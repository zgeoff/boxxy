import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface StubNoslopAnswers {
  // stdout of `noslop review --full`, `--fixes-only` and the plain `noslop review`; null prints
  // nothing, as a run that failed before its JSON
  readonly full: string | null;
  readonly fixesOnly: string | null;
  readonly plain: string | null;
  readonly findings: { readonly stdout: string; readonly exitCode: number };

  // what `git rev-parse HEAD` prints
  readonly head: string;
}

export interface StubNoslop {
  // the folder to put first on PATH
  readonly binPath: string;

  // each noslop call's arguments, in order
  readCalls: () => Promise<string[]>;
}

// Stand-ins for the `noslop` and `git` commands that a review command runs, in `root`.
export async function createStubNoslop(
  root: string,
  answers: StubNoslopAnswers,
): Promise<StubNoslop> {
  const binPath = join(root, 'bin');
  const callsPath = join(root, 'noslop-calls.log');

  await mkdir(binPath, { recursive: true });
  await writeFile(callsPath, '');

  const answerPath = async (name: string, text: string | null) => {
    const path = join(root, `${name}.out`);

    await writeFile(path, text ?? '');

    return path;
  };

  const noslop = [
    '#!/bin/sh',
    `printf '%s\\n' "$*" >> '${callsPath}'`,
    'case "$1 $2" in',
    `  "review --full") cat '${await answerPath('full', answers.full)}' ;;`,
    `  "review --fixes-only") cat '${await answerPath('fixes-only', answers.fixesOnly)}' ;;`,
    `  "review --pr") cat '${await answerPath('plain', answers.plain)}' ;;`,
    `  "findings --pr") cat '${await answerPath('findings', answers.findings.stdout)}'; exit ${answers.findings.exitCode} ;;`,
    'esac',
    '',
  ].join('\n');

  await writeCommand(join(binPath, 'noslop'), noslop);
  await writeCommand(join(binPath, 'git'), `#!/bin/sh\necho '${answers.head}'\n`);

  return {
    binPath,
    readCalls: async () => {
      const text = await readFile(callsPath, 'utf8');

      return text.split('\n').filter((line) => line !== '');
    },
  };
}

async function writeCommand(path: string, text: string): Promise<void> {
  await writeFile(path, text);
  await chmod(path, 0o755);
}
