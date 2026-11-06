import { expect, test } from 'bun:test';
import { frictionSchema } from './friction-schema.ts';

test.each(['skill', 'rule', 'lint', 'agents-md', 'tool'])(
  'it accepts a friction entry whose target kind is %s',
  (kind) => {
    const friction = { target: { kind, name: 'testing' }, change: 'Say where to seed faker' };

    expect(frictionSchema.safeParse(friction).data).toStrictEqual(friction);
  },
);

test('it rejects a friction entry whose target kind is outside the list', () => {
  const friction = { target: { kind: 'wiki', name: 'testing' }, change: 'Say where to seed faker' };

  expect(frictionSchema.safeParse(friction).error?.issues).toPartiallyContain({
    path: ['target', 'kind'],
  });
});

test('it rejects a friction entry with no target', () => {
  const friction = { change: 'Say where to seed faker' };

  expect(frictionSchema.safeParse(friction).error?.issues).toPartiallyContain({
    path: ['target'],
  });
});
