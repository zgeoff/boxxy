import { costToLandSchema, stageTimeSchema } from '@boxxy/model';
import type { ItemId, PepysAnswer, PepysReader } from '@boxxy/model';
import type { z } from 'zod';
import type { UncheckedQueryClient } from './types.ts';

interface PepysReaderOptions {
  readonly client: UncheckedQueryClient;

  // the environment whose deploy counts in the stage times, such as `production`
  readonly environment: string;
  readonly timeoutMs: number;
}

// The port takes boxxy's bare item ID; the queries take the item's entity ID. The reader never
// throws and never retries: a report is a read that the owner can ask again.
export function createPepysReader(options: PepysReaderOptions): PepysReader {
  const ask = makeAsk(options.timeoutMs);

  return {
    readCostToLand: (item) =>
      ask(costToLandSchema, () => options.client.boxxy_cost_to_land({ item: toItemEntity(item) })),
    readStageTime: (item) =>
      ask(stageTimeSchema, () =>
        options.client.boxxy_stage_time({
          item: toItemEntity(item),
          environment: options.environment,
        }),
      ),
  };
}

// An answer that parses is the value. An error, a timeout, no connection, or an answer that the
// schema refuses is `unavailable` with a reason. A refused answer means that the pepys deployment
// runs another version of this package than the boxxy server.
function makeAsk(timeoutMs: number) {
  return async <Value>(
    schema: z.ZodType<Value>,
    call: () => Promise<unknown>,
  ): Promise<PepysAnswer<Value>> => {
    const answer = await withTimeout(call, timeoutMs);

    if (answer.kind === 'unavailable') {
      return answer;
    }

    const parsed = schema.safeParse(answer.value);

    return parsed.success
      ? { kind: 'value', value: parsed.data }
      : { kind: 'unavailable', reason: 'pepys answered a shape this boxxy does not know' };
  };
}

async function withTimeout(
  call: () => Promise<unknown>,
  timeoutMs: number,
): Promise<PepysAnswer<unknown>> {
  const timer = Promise.withResolvers<PepysAnswer<unknown>>();

  const handle = setTimeout(() => {
    timer.resolve({ kind: 'unavailable', reason: `no answer in ${timeoutMs} ms` });
  }, timeoutMs);

  try {
    return await Promise.race([
      call().then(
        (value): PepysAnswer<unknown> => ({ kind: 'value', value }),
        (error: unknown): PepysAnswer<unknown> => ({ kind: 'unavailable', reason: String(error) }),
      ),
      timer.promise,
    ]);
  } finally {
    clearTimeout(handle);
  }
}

function toItemEntity(item: ItemId): string {
  return `boxxy:item:${item}`;
}
