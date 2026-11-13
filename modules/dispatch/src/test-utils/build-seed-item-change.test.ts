import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockNewId } from './build-mock-new-id.ts';
import { buildSeedItemChange } from './build-seed-item-change.ts';

test('it files the item with its file fact and no lever when no phase is given', () => {
  const seeded = buildSeedItemChange(buildMockNewId(), brandSchemas.instant.parse(1000), {});

  const received: unknown = [
    seeded.change.writes,
    seeded.change.facts.map((fact) => fact.type),
    seeded.row.filedAt,
  ];

  expect(received).toStrictEqual([
    [expect.objectContaining({ op: 'insert', table: 'items' })],
    ['boxxy.item.filed'],
    1000,
  ]);
});

test('it files the item with a retry lever at the phase it is given', () => {
  const seeded = buildSeedItemChange(buildMockNewId(), brandSchemas.instant.parse(1000), {
    phase: brandSchemas.phaseName.parse('review'),
    designMode: 'agent',
  });

  const received: unknown = [
    seeded.change.writes,
    seeded.change.facts.map((fact) => fact.type),
    seeded.row.fields,
  ];

  expect(received).toStrictEqual([
    [
      expect.objectContaining({ op: 'insert', table: 'items' }),
      expect.objectContaining({ op: 'insert', table: 'levers' }),
    ],
    ['boxxy.item.filed', 'boxxy.lever.recorded'],
    { designMode: 'agent' },
  ]);
});

test('it files the item with the acceptance list it is given', () => {
  const seeded = buildSeedItemChange(buildMockNewId(), brandSchemas.instant.parse(1000), {
    acceptance: [],
  });

  expect(seeded.row.acceptance).toStrictEqual([]);
});
