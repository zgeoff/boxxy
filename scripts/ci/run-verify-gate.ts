import { join } from 'node:path';
import { formatGateAnnotations } from './format-gate-annotations.ts';
import { parseGateEnvelope } from './parse-gate-envelope.ts';
import { parsePullRequestEvent } from './parse-pull-request-event.ts';
import type { RunCommand } from './run-command.ts';
import { runCommand } from './run-command.ts';

interface VerifyGateOptions {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly runCommand: RunCommand;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

// The step of the `verify / gate` check. The body comes from the event, as GitHub wrote it when the
// run started, so an `edited` run reads the report the grader just wrote.
export async function runVerifyGate(options: VerifyGateOptions): Promise<number> {
  const eventPath = options.env['GITHUB_EVENT_PATH'];
  const tempDirectory = options.env['RUNNER_TEMP'];

  if (eventPath === undefined || tempDirectory === undefined) {
    options.writeError(
      '::error::set GITHUB_EVENT_PATH and RUNNER_TEMP; a pull_request run sets both\n',
    );

    return 1;
  }

  const eventText = await Bun.file(eventPath).text();

  const event = parsePullRequestEvent(eventText);

  if (event.kind === 'refused') {
    options.writeError(`::error::${event.message}\n`);

    return 1;
  }

  const bodyFile = join(tempDirectory, 'pr-body.md');

  await Bun.write(bodyFile, event.body);

  // The checkout is GitHub's merge ref, so the merge base with the base branch is the base's tip,
  // and the gate fingerprints the change as it would land.
  const gate = await options.runCommand(
    ['bun', 'verify', 'gate', '--base', `origin/${event.baseRef}`, '--body-file', bodyFile],
    { cwd: options.cwd, env: options.env },
  );

  // a workflow command counts only at the start of a line
  const output =
    gate.stdout === '' || gate.stdout.endsWith('\n') ? gate.stdout : `${gate.stdout}\n`;

  options.writeOutput(output);
  options.writeError(gate.stderr);

  if (gate.exitCode === 0) {
    return 0;
  }

  for (const line of formatGateAnnotations(parseGateEnvelope(gate.stdout))) {
    options.writeOutput(`${line}\n`);
  }

  return gate.exitCode;
}

if (import.meta.main) {
  process.exitCode = await runVerifyGate({
    cwd: process.cwd(),
    env: process.env,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}
