import { expect, test } from 'bun:test';
import { callerIdentitySchema } from './caller-identity-schema.ts';

test('it accepts an issuer and a subject', () => {
  const caller = { issuer: 'https://issuer.example.test', subject: 'session-41' };
  const parsed: unknown = callerIdentitySchema.safeParse(caller).data;

  expect(parsed).toStrictEqual(caller);
});

test('it rejects a caller with an empty subject', () => {
  const caller = { issuer: 'https://issuer.example.test', subject: '' };

  expect(callerIdentitySchema.safeParse(caller).error?.issues).toPartiallyContain({
    path: ['subject'],
  });
});
