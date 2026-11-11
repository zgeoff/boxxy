import { expect, test } from 'bun:test';
import { findCallerIdentity } from './find-caller-identity.ts';
import { buildMockAtcSessionRead } from './test-utils/build-mock-atc-session-read.ts';

test('it reads the host issuer and the host id as the caller', () => {
  const read = buildMockAtcSessionRead({
    session: {
      host: { name: 'imp-widget', id: 'imp-id-widget', issuer: 'https://broker.test' },
    },
  });

  expect(findCallerIdentity(read.session)).toStrictEqual({
    issuer: 'https://broker.test',
    subject: 'imp-id-widget',
  });
});

test('it answers null when the host has no id', () => {
  const read = buildMockAtcSessionRead({
    session: { host: { name: 'imp-widget', issuer: 'https://broker.test' } },
  });

  expect(findCallerIdentity(read.session)).toBeNull();
});

test('it answers null when the host has no issuer', () => {
  const read = buildMockAtcSessionRead({
    session: { host: { name: 'imp-widget', id: 'imp-id-widget' } },
  });

  expect(findCallerIdentity(read.session)).toBeNull();
});

test('it answers null when atc reports no host key', () => {
  const { host: _, ...session } = buildMockAtcSessionRead().session;

  expect(findCallerIdentity(session)).toBeNull();
});
