import type { EntityRef } from '@boxxy/model';
import { buildMockWorkFact } from '@boxxy/model/test-utils/build-mock-work-fact';
import type { MockedFactType } from '@boxxy/model/test-utils/build-mock-work-fact';
import type { OutgoingFact } from '@pepys/kit';
import type { boxxySource } from '../boxxy-source.ts';
import { isOutgoingFact } from '../sink/is-outgoing-fact.ts';
import { toWireFact } from '../sink/to-wire-fact.ts';

interface AppliedFactOverrides {
  readonly payload?: Readonly<Record<string, unknown>>;

  // ISO 8601, as boxxy's sink writes it
  readonly at?: string;
  readonly entity?: EntityRef;
  readonly event?: string;
}

// One fact of a batch as boxxy's sink sends it: a model fact whose payload its schema accepts, in
// the sink's wire form. Ingest gives it the fact ID `event:boxxy:<event>`.
export function buildMockAppliedFact(
  type: MockedFactType,
  overrides: AppliedFactOverrides = {},
): OutgoingFact<typeof boxxySource> {
  const wire = toWireFact(
    buildMockWorkFact(type, {
      ...(overrides.payload === undefined ? {} : { payload: overrides.payload }),
      ...(overrides.entity === undefined ? {} : { entity: overrides.entity }),
      at: Date.parse(overrides.at ?? '2026-11-11T02:00:00.000Z'),
    }),
  );

  const fact = { ...wire, event: overrides.event ?? wire.event };

  if (!isOutgoingFact(fact)) {
    throw new Error(`a mock ${type} fact fails the schema of the boxxy fact family`);
  }

  return fact;
}
