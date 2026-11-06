import type { Gate } from './types/planning.ts';
import type { Registered } from './types/registries.ts';

export function defineGate<P>(gate: Gate<P>): Registered<'gate'> {
  return { kind: 'gate', name: gate.name, open: (use) => use(gate) };
}
