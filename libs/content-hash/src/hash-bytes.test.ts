import { expect, test } from 'bun:test';
import { hashBytes } from './hash-bytes.ts';

test('it returns the SHA-256 of the bytes as lowercase hex', () => {
  expect<string>(hashBytes(new TextEncoder().encode('abc'))).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
