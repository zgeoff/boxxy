import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createTestCLI } from './create-test-cli.ts';

test('#createTestCLI sends an owner procedure to the owner listener', async () => {
  const cli = await createTestCLI();
  const result = await cli.run(['status']);

  expect(result.exitCode).toBe(0);
});

test('#createTestCLI sends a session procedure to the worker listener with the worker token', async () => {
  const cli = await createTestCLI();
  const attempt = await cli.server.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  cli.server.callerProof.setCaller(attempt.caller);

  const result = await cli.run(['attempt', 'current']);

  expect(JSON.parse(result.stdout)).toMatchObject({ kind: 'attempt' });
});

test('#createTestCLI answers a session procedure with no attempt when no caller is set', async () => {
  const cli = await createTestCLI();
  const result = await cli.run(['attempt', 'current']);

  expect(result.exitCode).toBe(1);
});
