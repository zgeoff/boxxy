import { makeAnswerRun } from '../cli/make-answer-run.ts';
import type { Command } from '../types.ts';

export const planCommands: readonly Command[] = [
  {
    path: ['defer'],
    procedure: 'plan.defer',
    summary: 'Holds an item back from dispatch until a time, or until undefer.',
    options: { until: { type: 'string' }, reason: { type: 'string' } },
    run: makeAnswerRun((call) =>
      call.client.plan.defer({
        item: call.args.positional(0, 'item'),
        reason: call.args.requireString('reason'),
        until: call.args.string('until'),
      }),
    ),
  },
  {
    path: ['undefer'],
    procedure: 'plan.undefer',
    summary: 'Ends the deferral of an item.',
    options: {},
    run: makeAnswerRun((call) =>
      call.client.plan.undefer({ item: call.args.positional(0, 'item') }),
    ),
  },
  {
    path: ['expedite'],
    procedure: 'plan.expedite',
    summary: 'Puts items at the front of their pools, in the order given.',
    options: { reason: { type: 'string' }, expires: { type: 'string' } },
    run: makeAnswerRun((call) =>
      call.client.plan.expedite({
        items: call.args.positionalsFrom(0, 'item'),
        reason: call.args.requireString('reason'),
        expires: call.args.string('expires'),
      }),
    ),
  },
  {
    path: ['unexpedite'],
    procedure: 'plan.unexpedite',
    summary: 'Ends the expedite of an item.',
    options: {},
    run: makeAnswerRun((call) =>
      call.client.plan.unexpedite({ item: call.args.positional(0, 'item') }),
    ),
  },
];
