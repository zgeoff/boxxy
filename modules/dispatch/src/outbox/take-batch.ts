import type { OutboxFact } from '@boxxy/model';
import { measureWireBytes } from './measure-wire-bytes.ts';
import type { OutboxLimits, TakenBatch } from './types.ts';

// The longest prefix of the rows that holds `batchFacts` facts or fewer and stays inside
// `batchBytes`. A first row over `factBytes` comes back alone as `oversize`. The batch is empty
// only when no row is given, because one fact and its allowance fit `batchBytes`.
export function takeBatch(rows: readonly OutboxFact[], limits: OutboxLimits): TakenBatch {
  const taken: OutboxFact[] = [];
  let batchBytes = 0;

  for (const row of rows) {
    const wireBytes = measureWireBytes(row);

    if (wireBytes > limits.factBytes) {
      if (taken.length === 0) {
        return { kind: 'oversize', fact: row };
      }

      break;
    }

    const rowBytes = wireBytes + limits.envelopeBytes + 8;

    if (taken.length >= limits.batchFacts || batchBytes + rowBytes > limits.batchBytes) {
      break;
    }

    taken.push(row);

    batchBytes += rowBytes;
  }

  return { kind: 'batch', facts: taken };
}
