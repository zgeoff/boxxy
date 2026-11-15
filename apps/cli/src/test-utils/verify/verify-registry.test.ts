import { expect, test } from 'bun:test';
import { verifyRegistry } from './verify-registry.ts';

test('it runs the harness check on local only and the door metadata check on prod only', () => {
  const targets = verifyRegistry.checks.map((check) => ({
    name: check.name,
    targets: check.targets,
  }));

  expect(targets).toStrictEqual([
    { name: 'boxxy', targets: ['local'] },
    { name: 'mcp-door', targets: ['prod'] },
    { name: 'mcp-sign-in', targets: undefined },
  ]);
});
