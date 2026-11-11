import { expect, test } from 'bun:test';
import { itemRowSchema } from '../rows/item-row-schema.ts';
import { buildMockV1ItemRow } from './build-mock-v1-item-row.ts';

test('it builds an item row that the row schema accepts', () => {
  const built = buildMockV1ItemRow();
  const parsed: unknown = itemRowSchema.safeParse(built).data;

  expect(parsed).toStrictEqual(built);
});

test('it applies overrides on top of the defaults', () => {
  const item = buildMockV1ItemRow({ labels: ['flaky'], fields: { designMode: 'attended' } });

  expect(item).toStrictEqual(
    expect.objectContaining({ labels: ['flaky'], fields: { designMode: 'attended' } }),
  );
});
