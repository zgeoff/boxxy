import { expect, test } from 'bun:test';
import { parseCriterionFlag } from './parse-criterion-flag.ts';

test('it reads plain text as a new criterion', () => {
  expect(parseCriterionFlag('The theme follows the system.')).toStrictEqual({
    text: 'The theme follows the system.',
  });
});

test('it reads [id] and text as a criterion to keep', () => {
  expect(parseCriterionFlag('[c-3] The theme follows the system.')).toStrictEqual({
    id: 'c-3',
    text: 'The theme follows the system.',
  });
});

test('it reads a bracket in the middle of the text as part of a new criterion', () => {
  expect(parseCriterionFlag('Handles [x] marks')).toStrictEqual({ text: 'Handles [x] marks' });
});
