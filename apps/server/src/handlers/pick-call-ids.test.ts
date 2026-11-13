import { expect, test } from 'bun:test';
import { pickCallIDs } from './pick-call-ids.ts';

test.each([
  { title: 'an item', input: { item: 'i-12', text: 'a note' }, expected: { item: 'i-12' } },
  { title: 'an attempt', input: { attempt: 'a-3' }, expected: { attempt: 'a-3' } },
  {
    title: 'the attempt of a session call',
    input: { session: { attempt: 'a-3' }, closeOut: { verdict: 'secret body' } },
    expected: { attempt: 'a-3' },
  },
  { title: 'no ID', input: { repo: 'example/app', title: 'Fix it' }, expected: {} },
  { title: 'an ID that is not text', input: { item: 12 }, expected: {} },
  { title: 'an input that is no object', input: 'text', expected: {} },
])('it picks $title from the input, and no other field', (row) => {
  expect(pickCallIDs(row.input)).toStrictEqual(row.expected);
});
