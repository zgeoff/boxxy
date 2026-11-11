import { makeAnswerRun } from '../cli/make-answer-run.ts';
import type { Command } from '../types.ts';

export const reportCommands: readonly Command[] = [
  {
    path: ['cost'],
    procedure: 'report.cost',
    summary: 'Shows what one item cost, from pepys.',
    options: {},
    run: makeAnswerRun((call) =>
      call.client.report.cost({ item: call.args.positional(0, 'item') }),
    ),
  },
  {
    path: ['times'],
    procedure: 'report.stageTimes',
    summary: 'Shows how long one item took in each step, from pepys.',
    options: {},
    run: makeAnswerRun((call) =>
      call.client.report.stageTimes({ item: call.args.positional(0, 'item') }),
    ),
  },
];
