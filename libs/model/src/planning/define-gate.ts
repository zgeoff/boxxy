import type { Registered } from '../rules/types.ts';
import type { Gate } from './types.ts';

export function defineGate<P>(gate: Gate<P>): Registered<'gate'> {
  return { kind: 'gate', name: gate.name, open: (use) => use(gate) };
}
