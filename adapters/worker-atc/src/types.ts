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

// The two fields atc does not report yet. `caller`: the issuer and subject of the identity token
// that the imp broker signs for each call from the session's host. `usageLimit`: set once the agent
// stopped at the account's usage limit, with the reset time when the agent showed one.
export interface AtcSessionAdditions {
  readonly caller?: { readonly issuer: string; readonly subject: string } | null;
  readonly usageLimit?: { readonly seenAt: number; readonly resetsAt: number | null } | null;
}

export type AtcSession = OutputOf<SessionProcedures['get']>['session'] & AtcSessionAdditions;

// `session.get`'s answer. `lastActivityAt` is the time of the session's last trail event, in
// milliseconds, or its creation time when it has none.
export type AtcSessionRead = Omit<OutputOf<SessionProcedures['get']>, 'session'> & {
  readonly session: AtcSession;
};

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
