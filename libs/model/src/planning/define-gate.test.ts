import { expect, test } from 'bun:test';
import { z } from 'zod';
import { defineGate } from './define-gate.ts';

test('it registers the gate under its name, and hands the same gate back to open', () => {
  const gate = { name: 'defer', liftable: true, params: z.object({}), hold: () => null };
  const registered = defineGate(gate);

  expect({
    kind: registered.kind,
    name: registered.name,
    opened: registered.open((plugin): unknown => plugin),
  }).toStrictEqual({ kind: 'gate', name: 'defer', opened: gate });
});
