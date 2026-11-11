import { expect, test } from 'bun:test';
import { limitFillSchema } from './limit-fill-schema.ts';

test('it accepts a limit with the seats held', () => {
  const limit = { name: 'builders', max: 3, counts: { phase: ['build'] }, held: 2 };
  const parsed: unknown = limitFillSchema.safeParse(limit).data;

  expect(parsed).toStrictEqual(limit);
});

test('it rejects a limit with a negative count of held seats', () => {
  const limit = { name: 'builders', max: 3, counts: {}, held: -1 };

  expect(limitFillSchema.safeParse(limit).error?.issues).toPartiallyContain({ path: ['held'] });
});
