import { expect, test } from 'bun:test';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import { createOffOutbox } from './create-off-outbox.ts';

test('it reports the outbox as off, with the facts that wait in the store', async () => {
  const dispatch = await createTestDispatch();

  await dispatch.seedItem({});

  const outbox = createOffOutbox(dispatch.store, dispatch.clock);

  const status = await outbox.status();

  expect({ sink: status.sink, state: status.state, unsent: status.unsent }).toStrictEqual({
    sink: 'none',
    state: 'off',
    unsent: 1,
  });
});
