import type { Instant } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { api } from './api.ts';
import type { LeverAnswer } from './write-levers.ts';
import { writeLevers } from './write-levers.ts';

const noLever = { until: null, expiresAt: null, reason: null, phase: null } as const;

// The planning levers. Each records one lever per item, which `decide` reads on the next claim.
export const planHandlers = {
  defer: api.plan.defer.handler(async (options) => {
    const input = options.input;

    const answer = await writeLevers(options.context.deps, [input.item], {
      ...noLever,
      kind: 'plan.defer',
      until: input.until === undefined ? null : toInstant(input.until),
      reason: input.reason,
    });

    return { lever: getFirstLever(answer, options.errors.NOT_FOUND) };
  }),
  undefer: api.plan.undefer.handler(async (options) => {
    const answer = await writeLevers(options.context.deps, [options.input.item], {
      ...noLever,
      kind: 'plan.undefer',
    });

    return { lever: getFirstLever(answer, options.errors.NOT_FOUND) };
  }),
  expedite: api.plan.expedite.handler(async (options) => {
    const input = options.input;
    const notFound = options.errors.NOT_FOUND;

    const answer = await writeLevers(options.context.deps, input.items, {
      ...noLever,
      kind: 'plan.expedite',
      expiresAt: input.expires === undefined ? null : toInstant(input.expires),
      reason: input.reason,
    });

    if (answer.kind === 'not-found') {
      throw notFound({ data: { item: answer.item } });
    }

    return { levers: [...answer.levers] };
  }),
  unexpedite: api.plan.unexpedite.handler(async (options) => {
    const answer = await writeLevers(options.context.deps, [options.input.item], {
      ...noLever,
      kind: 'plan.unexpedite',
    });

    return { lever: getFirstLever(answer, options.errors.NOT_FOUND) };
  }),
};

// The contract takes ISO 8601 with an offset; the store keeps epoch milliseconds.
function toInstant(iso: string): Instant {
  return brandSchemas.instant.parse(Math.max(0, Date.parse(iso)));
}

interface NotFoundOptions {
  readonly data: { readonly item: string };
}

type NotFound = (options: NotFoundOptions) => Error;

function getFirstLever(answer: LeverAnswer, notFound: NotFound): number {
  if (answer.kind === 'not-found') {
    throw notFound({ data: { item: answer.item } });
  }

  return answer.levers[0] ?? 0;
}
