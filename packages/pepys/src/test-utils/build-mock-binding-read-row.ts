import type { BindingReadRow } from '../queries/types.ts';

export function buildMockBindingReadRow(overrides: Partial<BindingReadRow> = {}): BindingReadRow {
  return {
    attempt_id: 'boxxy:attempt:0193a1b2-0000-7000-8000-0000000000a1',
    session_id: 'telemetry:session:s-build',
    bound_at: '2026-11-11T02:00:05.000Z',
    caller_issuer: 'https://broker.example',
    caller_subject: 'imp-builder',
    ...overrides,
  };
}
