import type { FactId, FactSink, OutboxFact, SinkAnswer } from '@boxxy/model';

export interface FakeFactSink extends FactSink {
  // every call, in order
  readonly sends: readonly (readonly FactId[])[];

  // one copy per fact ID, as a pepys consumer keeps them
  readonly facts: ReadonlyMap<FactId, OutboxFact>;

  // the answers of the next calls, one for each call; then the fake answers as ingest does
  answerNext: (...answers: SinkAnswer[]) => void;

  // any batch that holds the fact is refused whole, with the status
  refuseFact: (id: FactId, status: 413 | 422) => void;
}

// A sink that stores a batch whole and answers `stored`, unless a scripted answer or a refused fact
// says otherwise. A scripted `stored` stores the batch; any other scripted answer stores nothing.
export function createFakeFactSink(): FakeFactSink {
  const sends: FactId[][] = [];

  const facts = new Map<FactId, OutboxFact>();
  const refused = new Map<FactId, 413 | 422>();

  const scripted: SinkAnswer[] = [];

  const keepBatch = (batch: readonly OutboxFact[]): void => {
    for (const fact of batch) {
      if (!facts.has(fact.factId)) {
        facts.set(fact.factId, fact);
      }
    }
  };

  return {
    sends,
    facts,
    answerNext: (...answers) => {
      scripted.push(...answers);
    },
    refuseFact: (id, status) => {
      refused.set(id, status);
    },
    send: (batch) => {
      sends.push(batch.map((fact) => fact.factId));

      const next = scripted.shift();

      if (next !== undefined) {
        if (next.kind === 'stored') {
          keepBatch(batch);
        }

        return Promise.resolve(next);
      }

      const status = batch
        .map((fact) => refused.get(fact.factId))
        .find((found) => found !== undefined);

      if (status !== undefined) {
        return Promise.resolve({
          kind: 'refused-batch',
          status,
          reason: 'a fact of the batch is refused',
        });
      }

      keepBatch(batch);

      return Promise.resolve({ kind: 'stored' });
    },
  };
}
