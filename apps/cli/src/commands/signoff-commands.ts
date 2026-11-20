import { makeAnswerRun } from '../cli/make-answer-run.ts';
import type { Command } from '../types.ts';

export const signoffCommands: readonly Command[] = [
  {
    path: ['signoff', 'list'],
    procedure: 'signoff.list',
    summary: 'Lists the items that wait for a sign-off, with the head to answer.',
    options: {},
    run: makeAnswerRun((call) => call.client.signoff.list({})),
  },
];
