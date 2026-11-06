import type { Admission } from './types/planning.ts';
import type { Registered } from './types/registries.ts';

export function defineAdmission<P>(admission: Admission<P>): Registered<'admission'> {
  return { kind: 'admission', name: admission.name, open: (use) => use(admission) };
}
