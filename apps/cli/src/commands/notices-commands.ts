import { makeAnswerRun } from '../cli/make-answer-run.ts';
import type { Command } from '../types.ts';

// The commands on the session that gets each hold notice.
export const noticesCommands: readonly Command[] = [
  {
    path: ['notices', 'register'],
    procedure: 'notices.register',
    summary: 'Sets the session that gets each hold notice, by its atc gateway ID.',
    options: {},
    run: makeAnswerRun((call) =>
      call.client.notices.register({ gatewayID: call.args.positional(0, 'gateway-id') }),
    ),
  },
  {
    path: ['notices', 'show'],
    procedure: 'notices.show',
    summary: 'Shows the session that gets each hold notice, and when it was set.',
    options: {},
    run: makeAnswerRun((call) => call.client.notices.show({})),
  },
];
