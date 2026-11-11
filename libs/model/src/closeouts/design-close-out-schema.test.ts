import { expect, test } from 'bun:test';
import { designCloseOutSchema } from './design-close-out-schema.ts';

test('it accepts a designed close-out with a summary and the location of the design', () => {
  const closeOut = {
    result: {
      kind: 'designed',
      design: { summary: 'One retry button per upload row', location: 'docs/design/retry.md' },
    },
    friction: [{ target: { kind: 'skill', name: 'docs-writing' }, change: 'Name the doc type' }],
    frictionDropped: 0,
  };

  const parsed: unknown = designCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects a designed close-out with an empty summary', () => {
  const closeOut = {
    result: { kind: 'designed', design: { summary: '', location: null } },
    friction: [],
    frictionDropped: 0,
  };

  expect(designCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['result', 'design', 'summary'],
  });
});
