import type { Registered } from '../rules/types.ts';
import type { Admission } from './types.ts';

export function defineAdmission<P>(admission: Admission<P>): Registered<'admission'> {
  return { kind: 'admission', name: admission.name, open: (use) => use(admission) };
}
