import type { Concept } from '@boxxy/model';
import { defineSignal } from '@boxxy/model';
import { z } from 'zod';

export const poolConcept: Concept = {
  name: 'pool',
  version: 1,
  signals: [
    defineSignal({
      name: 'oldest',
      params: z.object({}),
      value: (item) => item.filedAt,
    }),
  ],
  filterFields: [
    { name: 'phase', value: (item) => item.phase },
    { name: 'kind', value: (item) => item.kind },
    { name: 'repo', value: (item) => item.repo },
  ],
};
