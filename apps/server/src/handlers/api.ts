import { contract } from '@boxxy/contract';
import { ORPCError, implement } from '@orpc/server';
import { match } from 'ts-pattern';
import { authorizeCall } from '../auth/authorize-call.ts';
import { formatErrorChain } from '../format-error-chain.ts';
import type { ProvenCall, RequestContext } from '../types.ts';
import { pickCallIDs } from './pick-call-ids.ts';

// The contract with the root middleware on every procedure, so each handler built from it runs
// after the access check. A handler of a session or hook procedure gets the proven call. A call
// that fails with an internal error, which oRPC answers with a 500, logs one line on its way out.
export const api = implement(contract)
  .$context<RequestContext>()
  .use(async (options, input) => {
    try {
      const authorization = await authorizeCall(options.context, options.path);

      const call = match(authorization)
        .with({ kind: 'refused' }, (refused) => {
          throw new ORPCError(refused.code);
        })
        .with({ kind: 'owner' }, (): ProvenCall | null => null)
        .with({ kind: 'session' }, (session) => session.call)
        .exhaustive();

      return await options.next({ context: { call } });
    } catch (error) {
      // the router adds this middleware to each procedure that has it already, so it runs twice;
      // only the outer run, whose context has no proven call yet, logs
      if (isInternalFailure(error) && !Object.hasOwn(options.context, 'call')) {
        options.context.deps.log.warn('a call failed with an internal error', {
          procedure: options.path.join('.'),
          ...pickCallIDs(input),
          error: formatErrorChain(error),
        });
      }

      throw error;
    }
  });

// oRPC answers any throw that is not a typed error as INTERNAL_SERVER_ERROR
function isInternalFailure(error: unknown): boolean {
  return !(error instanceof ORPCError) || error.code === 'INTERNAL_SERVER_ERROR';
}
