import { expect, test } from 'bun:test';
import { createFakeCallerProof } from './create-fake-caller-proof.ts';

test('it proves no request before the test names a caller', () => {
  const proof = createFakeCallerProof();

  expect(proof.prove(new Request('http://boxxy.test/rpc'))).resolves.toBeNull();
});

test('it proves every request as the caller the test named', () => {
  const proof = createFakeCallerProof();

  proof.setCaller({ issuer: 'host-a', subject: 'machine-1' });

  expect(proof.prove(new Request('http://boxxy.test/rpc'))).resolves.toStrictEqual({
    issuer: 'host-a',
    subject: 'machine-1',
  });
});
