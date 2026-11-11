import { contract } from '@boxxy/contract';
import { ORPCError, implement } from '@orpc/server';
import { match } from 'ts-pattern';
import { authorizeCall } from '../auth/authorize-call.ts';
import type { ProvenCall, RequestContext } from '../types.ts';

// The contract with the root middleware on every procedure, so each handler built from it runs
// after the access check. A handler of a session or hook procedure gets the proven call.
export const api = implement(contract)
  .$context<RequestContext>()
  .use(async (options) => {
    const authorization = await authorizeCall(options.context, options.path);

    const call = match(authorization)
      .with({ kind: 'refused' }, (refused) => {
        throw new ORPCError(refused.code);
      })
      .with({ kind: 'owner' }, (): ProvenCall | null => null)
      .with({ kind: 'session' }, (session) => session.call)
      .exhaustive();

    return options.next({ context: { call } });
  });
