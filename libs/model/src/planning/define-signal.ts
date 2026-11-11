import type { Registered } from '../rules/types.ts';
import type { Signal } from './types.ts';

export function defineSignal<P>(signal: Signal<P>): Registered<'signal'> {
  return { kind: 'signal', name: signal.name, open: (use) => use(signal) };
}
