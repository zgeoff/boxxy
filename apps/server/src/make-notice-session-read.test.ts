import { expect, onTestFinished, test } from 'bun:test';
import { createMemoryClaimStore } from '@boxxy/dispatch/test-utils/create-memory-claim-store';
import { brandSchemas } from '@boxxy/model';
import { makeNoticeSessionRead } from './make-notice-session-read.ts';

function setupTest() {
  const store = createMemoryClaimStore();

  onTestFinished(() => store.close());

  return {
    readSession: makeNoticeSessionRead(store),
    writeSession: (gatewayID: string) =>
      store.exclusive((tx) =>
        tx.writeNoticeSession({ gatewayID, setAt: brandSchemas.instant.parse(1000) }),
      ),
  };
}

test('it reads null while the store holds no notice session', async () => {
  const ctx = setupTest();

  const session = await ctx.readSession();

  expect(session).toBeNull();
});

test('it reads the gateway ID of a session written after the read was made', async () => {
  const ctx = setupTest();

  await ctx.writeSession('desk.3.s7');

  const session = await ctx.readSession();

  expect(session).toBe('desk.3.s7');
});
