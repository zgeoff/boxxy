import { makeAnswerRun } from '../cli/make-answer-run.ts';
import type { Command } from '../types.ts';

export const relationCommands: readonly Command[] = [
  {
    path: ['relation', 'add'],
    procedure: 'relation.add',
    summary: 'Adds a relation from one item to another, such as "blocks".',
    options: {},
    run: makeAnswerRun((call) =>
      call.client.relation.add({
        source: call.args.positional(0, 'source'),
        type: call.args.positional(1, 'type'),
        target: call.args.positional(2, 'target'),
      }),
    ),
  },
  {
    path: ['relation', 'remove'],
    procedure: 'relation.remove',
    summary: 'Removes a relation between two items.',
    options: {},
    run: makeAnswerRun((call) =>
      call.client.relation.remove({
        source: call.args.positional(0, 'source'),
        type: call.args.positional(1, 'type'),
        target: call.args.positional(2, 'target'),
      }),
    ),
  },
];
