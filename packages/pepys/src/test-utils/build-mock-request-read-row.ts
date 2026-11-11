import type { RequestReadRow } from '../queries/types.ts';

// The origin matches the caller of the default binding row, so the two join.
export function buildMockRequestReadRow(overrides: Partial<RequestReadRow> = {}): RequestReadRow {
  return {
    session_id: 'telemetry:session:s-build',
    origin_issuer: 'https://broker.example',
    origin_subject: 'imp-builder',
    product: 'claude_code',
    at: '2026-11-11T02:20:00.000Z',
    model: 'model-large',
    cost_basis: 'reported',
    cost_usd: 0,
    input_tokens: 10,
    cache_read_tokens: 100,
    cache_creation_tokens: 0,
    output_tokens: 20,
    ...overrides,
  };
}
