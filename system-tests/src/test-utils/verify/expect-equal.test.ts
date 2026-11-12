import { expect, test } from 'bun:test';
import { expectEqual } from './expect-equal.ts';

test('#expectEqual passes on equal values', () => {
  expect(() => {
    expectEqual('the title', { items: [1] }, { items: [1] });
  }).not.toThrow();
});

test('#expectEqual fails with check-failed that names both values', () => {
  expect(() => {
    expectEqual('the title', 'Old', 'New');
  }).toThrowWithMessage(Error, 'the title: expected "New", got "Old"');
});
