import type { ProcedureName } from '@boxxy/contract';
import { access } from '@boxxy/contract';
import invariant from 'tiny-invariant';
import type { ProvenCall, RequestContext } from '../types.ts';

export type CallAuthorization =
  | { readonly kind: 'owner' }

  // a session or hook call with a proven caller; `call` is null when no session holds the caller
  | { readonly kind: 'session'; readonly call: ProvenCall | null }
  | { readonly kind: 'refused'; readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' };

// The one check of who may call a procedure, from the access table. Every door runs it before any
// handler, and no handler repeats it.
export async function authorizeCall(
  ctx: RequestContext,
  path: readonly string[],
): Promise<CallAuthorization> {
  const name = path.join('.');

  invariant(isProcedureName(name), `the router serves only contract procedures: ${name}`);

  if (access[name].caller === 'owner') {
    return ctx.scope === 'owner' ? { kind: 'owner' } : { kind: 'refused', code: 'FORBIDDEN' };
  }

  if (ctx.scope !== 'worker') {
    return { kind: 'refused', code: 'UNAUTHORIZED' };
  }

  const caller = await ctx.deps.callerProof.prove(ctx.request);

  if (caller === null) {
    return { kind: 'refused', code: 'UNAUTHORIZED' };
  }

  const session = await ctx.deps.store.read((tx) => tx.findSessionByCaller(caller));

  if (session === 'ambiguous') {
    ctx.deps.log.warn('two sessions hold one caller', { procedure: name, ...caller });

    return { kind: 'refused', code: 'FORBIDDEN' };
  }

  return { kind: 'session', call: session === null ? null : { session, caller } };
}

function isProcedureName(name: string): name is ProcedureName {
  return Object.hasOwn(access, name);
}
