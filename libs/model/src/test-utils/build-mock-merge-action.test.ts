import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockMergeAction } from './build-mock-merge-action.ts';

test('it builds a squash merge of one pull request at the head it is given', () => {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');
  const action: unknown = buildMockMergeAction(head);

  expect(action).toStrictEqual({
    kind: 'merge',
    unit: {
      members: [{ pullRequest: { repo: 'example/app', number: expect.any(Number) }, head }],
    },
    method: 'squash',
    required: ['pr / checks'],
  });
});
