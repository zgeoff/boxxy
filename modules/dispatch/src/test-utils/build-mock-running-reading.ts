import type { SessionReading } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

type RunningReading = Extract<SessionReading, { kind: 'running' }>;

// A working session with an agent session ID, no caller and no usage limit, active at time 0.
export function buildMockRunningReading(overrides: Partial<RunningReading> = {}): RunningReading {
  return {
    kind: 'running',
    atcSession: brandSchemas.atcSessionId.parse('atc-1'),
    agentSession: brandSchemas.agentSessionId.parse('agent-1'),
    caller: null,
    attention: 'working',
    lastActivityAt: brandSchemas.instant.parse(0),
    lastOwnerAt: brandSchemas.instant.parse(0),
    usageLimitResetsAt: null,
    ...overrides,
  };
}
