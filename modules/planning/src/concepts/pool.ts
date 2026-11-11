import type { Concept } from '@boxxy/model';
import { defineSignal } from '@boxxy/model';
import { z } from 'zod';

export const pool: Concept = {
  name: 'pool',
  version: 2,
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

    // an item that sets no design mode runs in agent mode
    { name: 'designMode', value: (item) => item.fields.designMode ?? 'agent' },
  ],
};
