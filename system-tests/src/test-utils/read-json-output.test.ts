import { expect, test } from 'bun:test';
import { z } from 'zod';
import { readJSONOutput } from './read-json-output.ts';

test('it keeps only the fields the schema names', () => {
  const result = { exitCode: 0, stdout: '{"item":"i-1","extra":true}\n', stderr: '' };
  const schema = z.object({ item: z.string() });

  expect(readJSONOutput(result, schema)).toStrictEqual({ item: 'i-1' });
});

test('it throws when the output does not match the schema', () => {
  const result = { exitCode: 0, stdout: '{"item":1}\n', stderr: '' };
  const schema = z.object({ item: z.string() });

  expect(() => readJSONOutput(result, schema)).toThrow();
});
