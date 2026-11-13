import { createLogger, isDeliveryAuthentic } from '@pepys/kit';
import { boxxySource } from '../boxxy-source.ts';

export interface IngestStandIn {
  // the receive route of the boxxy source, for the sender's `fetch` option
  readonly handleRequest: (request: Request) => Promise<Response>;

  // the events of the stored facts, in arrival order, a copy counted once
  readStored: () => Promise<readonly string[]>;
}

// Ingest's receive route in memory, with the kit's own signature check and batch read. The kit
// exports no route handler of ingest, so the answers are written here: 401, the read's 400 or
// 422, or the batch stored whole with a copy of an event dropped.
export function createIngestStandIn(secret: string): IngestStandIn {
  const path = boxxySource.live;

  if (path?.kind !== 'receive') {
    throw new Error('the boxxy source has no receive path');
  }

  const log = createLogger(process.stderr);
  const stored: string[] = [];

  return {
    handleRequest: async (request) => {
      const buffer = await request.arrayBuffer();

      const body = new Uint8Array(buffer);

      if (!isDeliveryAuthentic(path.check, secret, request.headers, body)) {
        return Response.json({ error: 'the signature does not match' }, { status: 401 });
      }

      const received = path.read(
        { headers: request.headers, body },
        { name: boxxySource.name, families: boxxySource.families, log },
      );

      if (received.kind === 'refused') {
        return Response.json({ error: received.reason }, { status: received.status });
      }

      if (received.kind === 'ignored') {
        return Response.json({ status: 'ignored' }, { status: 202 });
      }

      const events = received.batch.facts.map((pending) => pending.fact.id);

      stored.push(...events.filter((event) => !stored.includes(event)));

      return Response.json({ status: 'stored', stored: events.length });
    },
    readStored: () =>
      Promise.resolve(stored.map((event) => event.replace(`event:${boxxySource.name}:`, ''))),
  };
}
