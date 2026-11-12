import { expect, test } from 'bun:test';
import { formatErrorChain } from './format-error-chain.ts';

test('it formats an error as its name and message', () => {
  expect(formatErrorChain(new TypeError('the value is not a number'))).toBe(
    'TypeError: the value is not a number',
  );
});

test('it formats a value that is not an error as text', () => {
  expect(formatErrorChain('the worker went away')).toBe('the worker went away');
});

test('it adds the code of an error that has one', () => {
  const error = Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR' });

  expect(formatErrorChain(error)).toBe('Error SQLITE_IOERR: disk I/O error');
});

test('it adds each inner error of a nested AggregateError, and a cause that is one of them once', () => {
  const work = new Error('the write failed');
  const savepoint = new Error('no such savepoint');
  const inner = new AggregateError([work, savepoint], 'the change failed', { cause: savepoint });
  const rollback = new Error('no transaction is active');
  const outer = new AggregateError([inner, rollback], 'the work failed', { cause: inner });

  expect(formatErrorChain(outer)).toBe(
    'AggregateError: the work failed [AggregateError: the change failed [Error: the write failed] ' +
      '[Error: no such savepoint]] [Error: no transaction is active]',
  );
});

test('it adds a cause that is not an inner error', () => {
  const error = new Error('the claim failed', { cause: new Error('the lock timed out') });

  expect(formatErrorChain(error)).toBe(
    'Error: the claim failed (cause: Error: the lock timed out)',
  );
});

test('it stops at an error that causes itself', () => {
  const error = new Error('the loop');

  error.cause = error;

  expect(formatErrorChain(error)).toBe('Error: the loop (cause: (the same error again))');
});
