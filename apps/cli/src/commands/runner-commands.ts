import { makeAnswerRun } from '../cli/make-answer-run.ts';
import type { Command } from '../types.ts';

// The commands that act on the server as a whole.
export const runnerCommands: readonly Command[] = [
  {
    path: ['status'],
    procedure: 'runner.status',
    summary: 'Shows the limits, the live attempts, the strays, the unsent notices and the outbox.',
    options: {},
    run: makeAnswerRun((call) => call.client.runner.status({})),
  },
  {
    path: ['runner', 'pause'],
    procedure: 'runner.pause',
    summary: 'Pauses the runner. It starts no new attempt until resume.',
    options: {},
    run: makeAnswerRun((call) => call.client.runner.pause({})),
  },
  {
    path: ['runner', 'resume'],
    procedure: 'runner.resume',
    summary: 'Resumes the runner.',
    options: {},
    run: makeAnswerRun((call) => call.client.runner.resume({})),
  },
  {
    path: ['outbox', 'retry'],
    procedure: 'outbox.retry',
    summary: 'Clears the park mark of every parked outbox row.',
    options: {},
    run: makeAnswerRun((call) => call.client.outbox.retry({})),
  },
  {
    path: ['rules', 'dry-run'],
    procedure: 'rules.dryRun',
    summary: 'Shows where each open item would stand under a rules file. It writes nothing.',
    options: {},
    run: makeAnswerRun(async (call) => {
      const rules = await call.deps.readFile(call.args.positional(0, 'file'));

      return call.client.rules.dryRun({ rules });
    }),
  },
];
