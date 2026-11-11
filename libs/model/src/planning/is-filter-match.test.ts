import { expect, test } from 'bun:test';
import { isFilterMatch } from './is-filter-match.ts';

test.each([
  ['an empty filter', {}, { phase: ['build'] }, true],
  [
    'a field whose value the filter lists',
    { phase: ['build', 'review'] },
    { phase: ['review'] },
    true,
  ],
  [
    'a field whose value the filter does not list',
    { phase: ['design'] },
    { phase: ['build'] },
    false,
  ],
  ['a field the values do not hold', { designMode: ['attended'] }, { phase: ['design'] }, false],
  [
    'two fields of which one does not match',
    { phase: ['design'], designMode: ['attended'] },
    { phase: ['design'], designMode: ['agent'] },
    false,
  ],
])('it gives %s', (_title, filter, fields, expected) => {
  expect(isFilterMatch(filter, fields)).toBe(expected);
});
