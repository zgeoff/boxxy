import { defineFactFamily, defineSource, receiveFactBatch } from '@pepys/kit';
import { wireFactSchemas, wireRunnerFactSchemas } from './wire-fact-schemas.ts';

// Every boxxy fact names its item as the entity, so the family's entity kind is `boxxy:item`.
export const workFamily = defineFactFamily({
  stream: 'facts.boxxy.work',
  api: 'boxxy/1',
  entityKind: 'boxxy:item',
  types: wireFactSchemas,
});

// The runner's pause and resume facts name the runner, and no pepys consumer reads them: pepys
// keeps them in its fact log, where the owner can query them.
export const runnerFamily = defineFactFamily({
  stream: 'facts.boxxy.runner',
  api: 'boxxy/1',
  entityKind: 'boxxy:runner',
  types: wireRunnerFactSchemas,
});

// The path keeps the kit's limits, 100 facts and 1 MiB a batch, which hold the outbox's own
// batch budget.
export const boxxySource = defineSource({
  name: 'boxxy',
  families: [workFamily, runnerFamily],
  live: receiveFactBatch({
    route: '/boxxy/facts',
    check: {
      kind: 'hmac-sha256',
      header: 'x-boxxy-signature-256',
      secretEnv: 'PEPYS_BOXXY_SIGNING_SECRET',
    },
  }),
});
