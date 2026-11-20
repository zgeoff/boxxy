import { expect, test } from 'bun:test';
import { createFakeForge } from './create-fake-forge.ts';
import { createTestDispatch } from './create-test-dispatch.ts';
import { seedSignoffWait } from './seed-signoff-wait.ts';

test('it puts the item at the sign-off hold, with its merge attempt finished needs-signoff', async () => {
  const dispatch = await createTestDispatch();

  const forge = createFakeForge();

  const seeded = await seedSignoffWait(dispatch, forge);

  const view = await dispatch.store.read((tx) =>
    tx.readItem(seeded.item, dispatch.clock.now(), dispatch.rules()),
  );

  expect(view?.position).toMatchObject({ kind: 'hold', reason: 'owner sign-off' });
});
