import type { Signal } from './types/planning.ts';
import type { Registered } from './types/registries.ts';

export function defineSignal<P>(signal: Signal<P>): Registered<'signal'> {
  return { kind: 'signal', name: signal.name, open: (use) => use(signal) };
}
