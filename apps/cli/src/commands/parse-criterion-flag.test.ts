import { expect, test } from 'bun:test';
import { parseCriterionFlag, parseCriterionTags } from './parse-criterion-flag.ts';

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

test('it reads leading #tag words as the tags of a new criterion', () => {
  expect(parseCriterionFlag('#prod #slow The page loads.')).toStrictEqual({
    text: 'The page loads.',
    tags: ['prod', 'slow'],
  });
});

test('it reads the tags after the id of a criterion to keep', () => {
  expect(parseCriterionFlag('[c-3] #prod The page loads.')).toStrictEqual({
    id: 'c-3',
    text: 'The page loads.',
    tags: ['prod'],
  });
});

test('it reads a hash that starts no tag word as text', () => {
  expect(parseCriterionFlag('#1 priority is met')).toStrictEqual({ text: '#1 priority is met' });
});

test('#parseCriterionTags reads a line with no tag as plain text', () => {
  expect(parseCriterionTags('The page loads.')).toStrictEqual({ text: 'The page loads.' });
});
