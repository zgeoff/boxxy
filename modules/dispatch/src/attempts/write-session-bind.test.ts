import { expect, test } from 'bun:test';
import type { AttemptRow } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import type { SeenSession } from './types.ts';
import { writeSessionBind } from './write-session-bind.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,
    bind: (attempt: AttemptRow, session: SeenSession) =>
      dispatch.store.exclusive((tx) =>
        writeSessionBind(tx, attempt, session, {
          actor: 'boxxy:runner:runner-1',
          now: dispatch.clock.now(),
          newId: dispatch.newId,
        }),
      ),
  };
}

test('it refuses the agent session to a settled attempt whose rework took it over and succeeded', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({ startByWorker: true });
  const reading = await ctx.worker.reconcile(rework.first);

  invariant(reading.kind !== 'absent' && reading.agentSession !== null, 'the session is kept');

  const evidence = brandSchemas.factId.parse(ctx.newId());
  const now = ctx.clock.now();

  await ctx.store.exclusive((tx) =>
    tx.applyChange({
      at: now,
      writes: [
        {
          op: 'insert',
          table: 'evidence',
          row: {
            factId: evidence,
            attempt: rework.second.id,
            kind: 'test',
            ref: 'bun test',
            observed: 'pass',
            source: 'agent',
            at: now,
          },
        },
      ],
      facts: [
        {
          id: evidence,
          type: 'boxxy.evidence.recorded',
          entity: `boxxy:item:${rework.second.item}`,
          actor: `boxxy:attempt:${rework.second.id}`,
          payload: { attempt: rework.second.id, kind: 'test', ref: 'bun test', observed: 'pass' },
        },
      ],
    }),
  );

  await ctx.closeAndSettle(rework.second, {
    result: { kind: 'built' },
    criteria: [{ criterion: 'a1', evidence }],
    openItems: [],
    friction: [],
  });

  const second = await ctx.readAttempt(rework.second.id);

  invariant(second.state === 'succeeded', 'the rework succeeded');

  const fault = await ctx.bind(rework.first, {
    atcSession: reading.atcSession,
    agentSession: reading.agentSession,
  });

  expect(fault).toStrictEqual({
    kind: 'fault',
    fault: 'agent-session-owned',
    agentSession: reading.agentSession,
    attempt: rework.first.id,
    holder: rework.second.id,
  });
});
