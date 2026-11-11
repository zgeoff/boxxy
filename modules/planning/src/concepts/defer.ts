import type { Concept, SliceOneLeverRow as LeverRow } from '@boxxy/model';
import { defineGate, signalKey } from '@boxxy/model';
import { z } from 'zod';

const expediteKey = signalKey('expedite', {});

export const defer: Concept = {
  name: 'defer',
  version: 1,
  gates: [
    defineGate({
      name: 'defer',
      liftable: true,
      params: z.object({}),
      hold: (item, ctx) => {
        const latest = findLatestDefer(ctx.levers.filter((lever) => lever.item === item.id));

        if (latest === null || (latest.until !== null && latest.until <= ctx.now)) {
          return null;
        }

        const reason = latest.reason ?? 'deferred';

        return latest.until === null
          ? { gate: 'defer', reason }
          : { gate: 'defer', reason, until: latest.until };
      },
    }),
  ],
  waivers: [
    {
      name: 'expedite-lifts-defer',
      lifts: 'defer',
      lift: (item, hold, ctx) =>
        ctx.values.get(expediteKey)?.has(item.id) === true
          ? { waiver: 'expedite-lifts-defer', gate: hold.gate, reason: 'expedited' }
          : null,
    },
  ],
  levers: ['plan.defer', 'plan.undefer'],
};

function findLatestDefer(levers: readonly LeverRow[]): LeverRow | null {
  return levers
    .filter((lever) => lever.kind === 'plan.defer')
    .reduce<LeverRow | null>(
      (latest, lever) => (latest === null || lever.seq > latest.seq ? lever : latest),
      null,
    );
}
