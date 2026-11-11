import { expect, test } from 'bun:test';
import { toEntityID } from './to-entity-id.ts';

test('it gives the text of a valid entity ID back', () => {
  expect<string>(toEntityID('telemetry:session:s-build')).toBe('telemetry:session:s-build');
});

test('it throws for text that is no entity ID', () => {
  expect(() => toEntityID('telemetry-session')).toThrowWithMessage(Error, /malformed/u);
});
