import type { FactId, FactSink, OutboxFact } from '@boxxy/model';
import { buildMockOutboxFact } from '@boxxy/model/test-utils/build-mock-outbox-fact';

export interface FactSinkHarness {
  readonly sink: FactSink;

  // the fact IDs the log holds, in the order they arrived, a copy of an ID counted once
  readStored: () => Promise<readonly FactId[]>;

  // the same fact, changed so that the sink refuses a batch that holds it
  corrupt: (fact: OutboxFact) => OutboxFact;
}

export type FactSinkCase = readonly [
  title: string,
  check: (harness: FactSinkHarness) => Promise<{ received: unknown; expected: unknown }>,
];

// The cases that every adapter of the sink port must pass: the fake, and the pepys adapter behind
// ingest's route handler. Each case gets a harness with an empty log.
export const factSinkContract: readonly FactSinkCase[] = [
  [
    'a batch is stored whole and in order',
    async (harness) => {
      const batch = buildFacts(3, 1);

      const answer = await harness.sink.send(batch);

      return {
        received: { answer, stored: await harness.readStored() },
        expected: { answer: { kind: 'stored' }, stored: batch.map((fact) => fact.factId) },
      };
    },
  ],
  [
    'the same batch sent twice is stored as one copy of each fact',
    async (harness) => {
      const batch = buildFacts(2, 1);

      await harness.sink.send(batch);

      const answer = await harness.sink.send(batch);

      return {
        received: { answer, stored: await harness.readStored() },
        expected: { answer: { kind: 'stored' }, stored: batch.map((fact) => fact.factId) },
      };
    },
  ],
  [
    'two batches sent one after the other keep their order',
    async (harness) => {
      const first = buildFacts(2, 1);
      const second = buildFacts(2, 3);

      await harness.sink.send(first);
      await harness.sink.send(second);

      return {
        received: await harness.readStored(),
        expected: [...first, ...second].map((fact) => fact.factId),
      };
    },
  ],
  [
    'a batch with a bad fact is refused whole and stores none of it',
    async (harness) => {
      const [good, bad] = buildPair();

      const answer = await harness.sink.send([good, harness.corrupt(bad)]);

      return {
        received: { kind: answer.kind, stored: await harness.readStored() },
        expected: { kind: 'refused-batch', stored: [] },
      };
    },
  ],
  [
    'a good batch is stored after a bad one was refused',
    async (harness) => {
      const [good, bad] = buildPair();

      await harness.sink.send([good, harness.corrupt(bad)]);

      const answer = await harness.sink.send([good]);

      return {
        received: { answer, stored: await harness.readStored() },
        expected: { answer: { kind: 'stored' }, stored: [good.factId] },
      };
    },
  ],
];

function buildFacts(count: number, firstSeq: number): OutboxFact[] {
  return Array.from({ length: count }, (_unused, index) =>
    buildMockOutboxFact({ seq: firstSeq + index }),
  );
}

function buildPair(): [OutboxFact, OutboxFact] {
  return [buildMockOutboxFact({ seq: 1 }), buildMockOutboxFact({ seq: 2 })];
}
