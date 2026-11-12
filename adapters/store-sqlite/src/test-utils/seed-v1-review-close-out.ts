import { Database } from 'bun:sqlite';
import type { AttemptId } from '@boxxy/model';
import { z } from 'zod';

export interface V1ReviewCloseOutSeed {
  readonly attempt: AttemptId;

  // the body as the v1 review phase kind stored it
  readonly closeOut: unknown;
}

const closedOutSchema = z.object({ close_out_fact: z.string() });
const factSchema = z.object({ seq: z.number() });

// A review closed out before the review gate: no code in the repo writes that body now, so the
// seed puts it in place of the stored close-out of a closed-out review, and in its fact.
export function seedV1ReviewCloseOut(path: string, seed: V1ReviewCloseOutSeed): void {
  using sqlite = new Database(path, { readwrite: true });

  const body = JSON.stringify(seed.closeOut);

  const attempt = closedOutSchema.parse(
    sqlite
      .query('UPDATE attempts SET close_out = ? WHERE id = ? RETURNING close_out_fact')
      .get(body, seed.attempt),
  );

  factSchema.parse(
    sqlite
      .query(
        "UPDATE outbox SET payload = json_set(payload, '$.closeOut', json(?)) WHERE fact_id = ? RETURNING seq",
      )
      .get(body, attempt.close_out_fact),
  );
}
