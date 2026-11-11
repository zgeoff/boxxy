import type { DAEMON_CONTRACT } from '@atcx/contract';
import type { z } from 'zod';

type SessionProcedures = (typeof DAEMON_CONTRACT)['session'];

type InputOf<Procedure> = Procedure extends { '~orpc': { inputSchema?: infer Schema } }
  ? z.input<Schema>
  : never;

type OutputOf<Procedure> = Procedure extends { '~orpc': { outputSchema?: infer Schema } }
  ? z.output<Schema>
  : never;

type CallOf<Procedure> = (input: InputOf<Procedure>) => Promise<OutputOf<Procedure>>;

// `host` is the VM host that runs the session: sub-sessions on one machine share it, and a session
// with no VM host has none. atc reports no usage limit.
export type AtcSession = OutputOf<SessionProcedures['get']>['session'];

// `session.get`'s answer. `lastActivityAt` is the time of the session's last trail event, in
// milliseconds, or its creation time when it has none.
export type AtcSessionRead = OutputOf<SessionProcedures['get']>;

// The atc calls that the adapter makes, with atc's own inputs and answers. A call that atc refuses
// rejects with an error that carries atc's `code` and `data`.
export interface AtcClient {
  readonly session: {
    readonly spawn: (
      input: InputOf<SessionProcedures['spawn']>,
    ) => Promise<{ readonly session: AtcSession }>;
    readonly get: (input: InputOf<SessionProcedures['get']>) => Promise<AtcSessionRead>;
    readonly list: (
      input: InputOf<SessionProcedures['list']>,
    ) => Promise<{ readonly sessions: readonly AtcSession[] }>;
    readonly kill: CallOf<SessionProcedures['kill']>;
    readonly adopt: CallOf<SessionProcedures['adopt']>;
    readonly forget: CallOf<SessionProcedures['forget']>;
    readonly message: CallOf<SessionProcedures['message']>;
  };
}
