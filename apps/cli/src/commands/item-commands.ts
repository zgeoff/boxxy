import { makeAnswerRun } from '../cli/make-answer-run.ts';
import type { Command } from '../types.ts';
import { parseCriterionFlag } from './parse-criterion-flag.ts';
import { readItemBody } from './read-item-body.ts';

const designModes = ['agent', 'attended'] as const;
const itemStates = ['idea', 'ready', 'blocked', 'running', 'waiting', 'done', 'archived'] as const;

export const itemCommands: readonly Command[] = [
  {
    path: ['item', 'file'],
    procedure: 'item.file',
    summary: 'Files a new item of work.',
    options: {
      repo: { type: 'string' },
      title: { type: 'string' },
      outcome: { type: 'string' },
      body: { type: 'string' },
      'body-file': { type: 'string' },
      acceptance: { type: 'string', multiple: true },
      kind: { type: 'string' },
      'design-mode': { type: 'string' },
      'blocked-by': { type: 'string', multiple: true },
      label: { type: 'string', multiple: true },
    },
    run: makeAnswerRun(async (call) =>
      call.client.item.file({
        repo: call.args.requireString('repo'),
        title: call.args.requireString('title'),
        outcome: call.args.requireString('outcome'),
        body: await readItemBody(call),
        acceptance: call.args.strings('acceptance'),
        blockedBy: call.args.strings('blocked-by'),
        labels: call.args.strings('label'),
        kind: call.args.string('kind'),
        designMode: call.args.oneOf('design-mode', designModes),
      }),
    ),
  },
  {
    path: ['item', 'edit'],
    procedure: 'item.edit',
    summary: 'Replaces the given fields of an item. A flag that is left out changes nothing.',
    options: {
      title: { type: 'string' },
      outcome: { type: 'string' },
      body: { type: 'string' },
      'body-file': { type: 'string' },
      acceptance: { type: 'string', multiple: true },
      'design-mode': { type: 'string' },
      label: { type: 'string', multiple: true },
    },
    run: makeAnswerRun(async (call) => {
      const acceptance = call.args.strings('acceptance');
      const labels = call.args.strings('label');

      return call.client.item.edit({
        item: call.args.positional(0, 'item'),
        title: call.args.string('title'),
        outcome: call.args.string('outcome'),
        body: await readItemBody(call),
        designMode: call.args.oneOf('design-mode', designModes),
        acceptance:
          acceptance.length === 0
            ? undefined
            : acceptance.map((entry) => parseCriterionFlag(entry)),
        labels: labels.length === 0 ? undefined : labels,
      });
    }),
  },
  {
    path: ['item', 'close'],
    procedure: 'item.close',
    summary: 'Closes an item and ends its live attempt. With --of, closes it as a duplicate.',
    options: { reason: { type: 'string' }, of: { type: 'string' } },
    run: makeAnswerRun((call) =>
      call.client.item.close({
        item: call.args.positional(0, 'item'),
        reason: call.args.requireString('reason'),
        of: call.args.string('of'),
      }),
    ),
  },
  {
    path: ['item', 'retry'],
    procedure: 'item.retry',
    summary: 'Lifts a hold and resets the attempt counts. With --phase, sets the position.',
    options: { phase: { type: 'string' } },
    run: makeAnswerRun((call) =>
      call.client.item.retry({
        item: call.args.positional(0, 'item'),
        phase: call.args.string('phase'),
      }),
    ),
  },
  {
    path: ['item', 'wake'],
    procedure: 'item.wake',
    summary: 'Asks boxxy to wake the sleeping session of an item.',
    options: {},
    run: makeAnswerRun((call) => call.client.item.wake({ item: call.args.positional(0, 'item') })),
  },
  {
    path: ['item', 'note'],
    procedure: 'item.note',
    summary: 'Appends a note to an item. The next attempt reads it.',
    options: { text: { type: 'string' } },
    run: makeAnswerRun((call) =>
      call.client.item.note({
        item: call.args.positional(0, 'item'),
        text: call.args.requireString('text'),
      }),
    ),
  },
  {
    path: ['item', 'show'],
    procedure: 'item.get',
    summary:
      'Shows one item with its body, position, notes, attempts, relations and pull requests.',
    options: {},
    run: makeAnswerRun((call) => call.client.item.get({ item: call.args.positional(0, 'item') })),
  },
  {
    path: ['item', 'list'],
    procedure: 'item.list',
    summary: 'Lists items, newest first, with filters.',
    options: {
      state: { type: 'string' },
      repo: { type: 'string' },
      phase: { type: 'string' },
      text: { type: 'string' },
      label: { type: 'string' },
      limit: { type: 'string' },
      after: { type: 'string' },
    },
    run: makeAnswerRun((call) =>
      call.client.item.list({
        state: call.args.oneOf('state', itemStates),
        repo: call.args.string('repo'),
        phase: call.args.string('phase'),
        text: call.args.string('text'),
        label: call.args.string('label'),
        limit: call.args.integer('limit'),
        after: call.args.string('after'),
      }),
    ),
  },
];
