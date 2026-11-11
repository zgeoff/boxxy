import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockRunningReading } from './build-mock-running-reading.ts';

test('it builds a working reading with the overrides applied', () => {
  const reading = buildMockRunningReading({ attention: 'needs-input' });

  expect(reading).toStrictEqual({
    kind: 'running',
    atcSession: brandSchemas.atcSessionId.parse('atc-1'),
    agentSession: brandSchemas.agentSessionId.parse('agent-1'),
    caller: null,
    attention: 'needs-input',
    lastActivityAt: brandSchemas.instant.parse(0),
    lastOwnerAt: brandSchemas.instant.parse(0),
    usageLimitResetsAt: null,
  });
});
