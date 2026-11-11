import { expect, test } from 'bun:test';
import { findCallerIdentity } from './find-caller-identity.ts';
import { buildMockAtcSessionRead } from './test-utils/build-mock-atc-session-read.ts';

test('it reads the issuer and subject that atc reports for the session', () => {
  const read = buildMockAtcSessionRead({
    session: { caller: { issuer: 'https://broker.test', subject: 'imp-widget' } },
  });

  expect(findCallerIdentity(read.session)).toStrictEqual({
    issuer: 'https://broker.test',
    subject: 'imp-widget',
  });
});

test('it answers null when atc reports a null caller', () => {
  const read = buildMockAtcSessionRead({ session: { caller: null } });

  expect(findCallerIdentity(read.session)).toBeNull();
});

test('it answers null when atc reports no caller field', () => {
  const { caller: _, ...session } = buildMockAtcSessionRead().session;

  expect(findCallerIdentity(session)).toBeNull();
});
