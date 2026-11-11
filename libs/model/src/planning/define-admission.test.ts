import { expect, test } from 'bun:test';
import { z } from 'zod';
import { defineAdmission } from './define-admission.ts';

test('it registers the admission under its name, and hands the same admission back to open', () => {
  const admission = {
    name: 'repo-any-pool',
    params: z.object({ repos: z.array(z.string()) }),
    admit: () => null,
  };

  const registered = defineAdmission(admission);

  expect({
    kind: registered.kind,
    name: registered.name,
    opened: registered.open((plugin): unknown => plugin),
  }).toStrictEqual({ kind: 'admission', name: 'repo-any-pool', opened: admission });
});
