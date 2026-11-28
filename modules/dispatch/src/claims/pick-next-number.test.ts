import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { pickNextNumber } from './pick-next-number.ts';

test.each([
  { name: 'no attempts', attempts: [[]], expected: 1 },
  { name: 'numbers with no gap', attempts: [[1]], expected: 2 },
  { name: 'a gap in the numbers', attempts: [[1, 3]], expected: 4 },
])('it picks the next number after $name', (row) => {
  const phase = brandSchemas.phaseName.parse('build');
  const attempts = row.attempts.flat().map((number) => ({ phase, number }));

  expect(pickNextNumber(attempts, phase)).toBe(row.expected);
});

test('it ignores the attempts of another phase', () => {
  const build = brandSchemas.phaseName.parse('build');
  const review = brandSchemas.phaseName.parse('review');

  const attempts = [
    { phase: review, number: 5 },
    { phase: build, number: 2 },
  ];

  expect(pickNextNumber(attempts, build)).toBe(3);
});
