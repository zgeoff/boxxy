import { defineFactFamily, defineSource, receiveFactBatch } from '@pepys/kit';
import { wireFactSchemas } from './wire-fact-schemas.ts';

// Every boxxy fact names its item as the entity, so the family's entity kind is `boxxy:item`.
export const workFamily = defineFactFamily({
  stream: 'facts.boxxy.work',
  api: 'boxxy/1',
  entityKind: 'boxxy:item',
  types: wireFactSchemas,
});

// The path keeps the kit's limits, 100 facts and 1 MiB a batch, which hold the outbox's own
// batch budget.
export const boxxySource = defineSource({
  name: 'boxxy',
  families: [workFamily],
  live: receiveFactBatch({
    route: '/boxxy/facts',
    check: {
      kind: 'hmac-sha256',
      header: 'x-boxxy-signature-256',
      secretEnv: 'PEPYS_BOXXY_SIGNING_SECRET',
    },
  }),
});
