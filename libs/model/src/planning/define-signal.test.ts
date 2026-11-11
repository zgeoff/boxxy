import { expect, test } from 'bun:test';
import { z } from 'zod';
import { defineSignal } from './define-signal.ts';

test('it registers the signal under its name, and hands the same signal back to open', () => {
  const signal = {
    name: 'kind-order',
    params: z.object({ order: z.array(z.string()) }),
    value: () => null,
  };

  const registered = defineSignal(signal);

  expect({
    kind: registered.kind,
    name: registered.name,
    opened: registered.open((plugin): unknown => plugin),
  }).toStrictEqual({ kind: 'signal', name: 'kind-order', opened: signal });
});
