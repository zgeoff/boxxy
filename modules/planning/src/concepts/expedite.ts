import type { Concept } from '@boxxy/model';
import { defineSignal } from '@boxxy/model';
import { z } from 'zod';

export const expediteConcept: Concept = {
  name: 'expedite',
  version: 1,
  signals: [
    defineSignal({
      name: 'expedite',
      params: z.object({}),
      value: (item, ctx) => {
        const position = ctx.levers
          .filter((lever) => lever.kind === 'plan.expedite')
          .toSorted((left, right) => left.seq - right.seq)
          .findIndex((lever) => lever.item === item.id);

        return position === -1 ? null : position;
      },
      combine: (left, right) => Math.min(left, right),
    }),
  ],
  levers: ['plan.expedite', 'plan.unexpedite'],
};
