import type { OutboxFact } from '../facts/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockFactId } from './build-mock-fact-id.ts';

// An unsent, unparked `boxxy.item.noted` row for the item `i-<seq>`.
export function buildMockOutboxFact(overrides: Partial<OutboxFact> = {}): OutboxFact {
  const seq = overrides.seq ?? 1;

  return {
    seq,
    factId: buildMockFactId(),
    type: 'boxxy.item.noted',
    entity: `boxxy:item:i-${seq}`,
    actor: 'boxxy:owner:local',
    at: brandSchemas.instant.parse(1_800_000_000_000 + seq),
    payload: { seq, text: 'a note' },
    sentAt: null,
    parkedAt: null,
    parkedReason: null,
    ...overrides,
  };
}
