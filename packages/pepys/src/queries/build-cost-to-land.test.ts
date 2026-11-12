import { expect, test } from 'bun:test';
import { costToLandSchema } from '@boxxy/model';
import { buildMockAttemptReadRow } from '../test-utils/build-mock-attempt-read-row.ts';
import { buildMockBindingReadRow } from '../test-utils/build-mock-binding-read-row.ts';
import { buildMockRequestReadRow } from '../test-utils/build-mock-request-read-row.ts';
import { buildCostToLand } from './build-cost-to-land.ts';

test('it counts each model request for one attempt, splits rework out, and keeps an unknown cost apart from zero', () => {
  const cost = buildCostToLand({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    attempts: [
      buildMockAttemptReadRow({ id: 'boxxy:attempt:a1', phase: 'triage', number: 1 }),
      buildMockAttemptReadRow({ id: 'boxxy:attempt:a2', phase: 'build', number: 2 }),
      buildMockAttemptReadRow({ id: 'boxxy:attempt:a3', phase: 'review', number: 3 }),
      buildMockAttemptReadRow({ id: 'boxxy:attempt:a4', phase: 'build', number: 4, round: 2 }),
      buildMockAttemptReadRow({ id: 'boxxy:attempt:a5', phase: 'review', number: 5, round: 2 }),
    ],
    bindings: [
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:a1',
        session_id: 'telemetry:session:s-triage',
        bound_at: '2026-11-11T02:01:05.000Z',
      }),
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:a2',
        session_id: 'telemetry:session:agent-7',
        bound_at: '2026-11-11T02:10:05.000Z',
      }),
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:a2',
        session_id: 'telemetry:session:s-build',
        bound_at: '2026-11-11T02:10:05.000Z',
      }),
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:a3',
        session_id: 'telemetry:session:s-review',
        bound_at: '2026-11-11T03:16:05.000Z',
      }),
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:a4',
        session_id: 'telemetry:session:s-build',
        bound_at: '2026-11-11T03:40:05.000Z',
      }),
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:a5',
        session_id: 'telemetry:session:s-rereview',
        bound_at: '2026-11-11T04:12:05.000Z',
      }),

      // another item's attempt takes the session `s-build` at 04:40
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:b1',
        session_id: 'telemetry:session:s-build',
        bound_at: '2026-11-11T04:40:00.000Z',
      }),
    ],
    requests: [
      // in `s-build` before the second build was bound: the first build's
      buildMockRequestReadRow({
        session_id: 'telemetry:session:s-build',
        cost_usd: 0.5,
        at: '2026-11-11T02:20:00.000Z',
      }),

      // a record with no atc session ID: the agent session row finds it
      buildMockRequestReadRow({
        session_id: 'telemetry:session:agent-7',
        cost_usd: 0.25,
        at: '2026-11-11T02:26:00.000Z',
      }),

      // after the second build was bound, with a time that has no fraction: rework
      buildMockRequestReadRow({
        session_id: 'telemetry:session:s-build',
        cost_usd: 0.25,
        at: '2026-11-11T03:50:00Z',
      }),

      // after the other item's attempt was bound: not this item's
      buildMockRequestReadRow({
        session_id: 'telemetry:session:s-build',
        cost_usd: 9,
        at: '2026-11-11T04:45:00.000Z',
      }),

      // a product with no cost on the request row
      buildMockRequestReadRow({
        session_id: 'telemetry:session:s-review',
        product: 'codex',
        model: 'model-small',
        cost_basis: 'none',
        cost_usd: null,
        at: '2026-11-11T03:20:00.000Z',
      }),
    ],
    turns: [
      {
        session_id: 'telemetry:session:s-review',
        origin_issuer: 'https://broker.example',
        origin_subject: 'imp-builder',
        product: 'codex',
        model: 'model-small',
        cost_usd: 0.125,
        at: '2026-11-11T03:21:00.000Z',
      },
    ],
    pullRequests: [{ id: 'github:pull_request:9001', merged_at: '2026-11-11T05:00:00Z' }],
  });

  expect(cost).toStrictEqual({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    landedAt: '2026-11-11T05:00:00Z',
    attempts: 5,
    lines: [
      {
        phase: 'build',
        rework: false,
        product: 'claude_code',
        model: 'model-large',
        requests: 2,
        inputTokens: 20,
        cacheReadTokens: 200,
        cacheCreationTokens: 0,
        outputTokens: 40,
        costUSD: 0.75,
        costBasis: 'reported',
      },
      {
        phase: 'build',
        rework: true,
        product: 'claude_code',
        model: 'model-large',
        requests: 1,
        inputTokens: 10,
        cacheReadTokens: 100,
        cacheCreationTokens: 0,
        outputTokens: 20,
        costUSD: 0.25,
        costBasis: 'reported',
      },
      {
        phase: 'review',
        rework: false,
        product: 'codex',
        model: 'model-small',
        requests: 1,
        inputTokens: 10,
        cacheReadTokens: 100,
        cacheCreationTokens: 0,
        outputTokens: 20,
        costUSD: null,
        costBasis: 'none',
      },
      {
        phase: 'review',
        rework: false,
        product: 'codex',
        model: 'model-small',
        requests: 0,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 0,
        costUSD: 0.125,
        costBasis: 'turn',
      },
    ],
    totals: { requests: 4, costUSD: 1.125, reworkCostUSD: 0.25, requestsWithoutCost: 0 },
  });
});

test('it counts a telemetry row whose origin is the attempt caller, and not a row of another origin under the same session', () => {
  const cost = buildCostToLand({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    attempts: [buildMockAttemptReadRow({ id: 'boxxy:attempt:a2' })],
    bindings: [buildMockBindingReadRow({ attempt_id: 'boxxy:attempt:a2' })],
    requests: [
      buildMockRequestReadRow({ cost_usd: 0.5, at: '2026-11-11T02:20:00.000Z' }),
      buildMockRequestReadRow({
        origin_issuer: 'https://broker.example',
        origin_subject: 'imp-other',
        cost_usd: 7,
        at: '2026-11-11T02:21:00.000Z',
      }),
    ],
    turns: [],
    pullRequests: [],
  });

  expect(cost.totals).toStrictEqual({
    requests: 1,
    costUSD: 0.5,
    reworkCostUSD: 0,
    requestsWithoutCost: 0,
  });
});

test('it counts no telemetry for an attempt that has no caller', () => {
  const cost = buildCostToLand({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    attempts: [buildMockAttemptReadRow({ id: 'boxxy:attempt:a2' })],
    bindings: [
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:a2',
        caller_issuer: null,
        caller_subject: null,
      }),
    ],
    requests: [buildMockRequestReadRow({ cost_usd: 0.5 })],
    turns: [],
    pullRequests: [],
  });

  expect(cost.lines).toStrictEqual([]);
});

test('it counts a no-capacity attempt in no total, and the cost of a usage-limit attempt', () => {
  const cost = buildCostToLand({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    attempts: [
      buildMockAttemptReadRow({
        id: 'boxxy:attempt:a1',
        number: 1,
        state: 'failed',
        failure: 'no-capacity',
        outcome: 'lost',
      }),
      buildMockAttemptReadRow({
        id: 'boxxy:attempt:a2',
        number: 2,
        state: 'failed',
        failure: 'usage-limit',
        outcome: 'lost',
      }),
    ],
    bindings: [buildMockBindingReadRow({ attempt_id: 'boxxy:attempt:a2' })],
    requests: [buildMockRequestReadRow({ cost_usd: 0.5 })],
    turns: [],
    pullRequests: [],
  });

  expect({ attempts: cost.attempts, totals: cost.totals }).toStrictEqual({
    attempts: 1,
    totals: { requests: 1, costUSD: 0.5, reworkCostUSD: 0, requestsWithoutCost: 0 },
  });
});

test('it counts the requests of a none line with no turn line as without cost', () => {
  const cost = buildCostToLand({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    attempts: [buildMockAttemptReadRow({ id: 'boxxy:attempt:a3', phase: 'review' })],
    bindings: [
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:a3',
        session_id: 'telemetry:session:s-review',
      }),
    ],
    requests: [
      buildMockRequestReadRow({
        session_id: 'telemetry:session:s-review',
        product: 'codex',
        cost_basis: 'none',
        cost_usd: null,
        at: '2026-11-11T03:20:00.000Z',
      }),
      buildMockRequestReadRow({
        session_id: 'telemetry:session:s-review',
        product: 'codex',
        cost_basis: 'none',
        cost_usd: null,
        at: '2026-11-11T03:22:00.000Z',
      }),
    ],
    turns: [],
    pullRequests: [],
  });

  expect(cost.totals).toStrictEqual({
    requests: 2,
    costUSD: 0,
    reworkCostUSD: 0,
    requestsWithoutCost: 2,
  });
});

test('it counts a none request as without cost when only another session of its phase has a turn cost', () => {
  const cost = buildCostToLand({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    attempts: [
      buildMockAttemptReadRow({ id: 'boxxy:attempt:a3', phase: 'review', number: 3 }),
      buildMockAttemptReadRow({ id: 'boxxy:attempt:a4', phase: 'review', number: 4 }),
    ],
    bindings: [
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:a3',
        session_id: 'telemetry:session:s-paid',
      }),
      buildMockBindingReadRow({
        attempt_id: 'boxxy:attempt:a4',
        session_id: 'telemetry:session:s-unpaid',
      }),
    ],
    requests: [
      buildMockRequestReadRow({
        session_id: 'telemetry:session:s-paid',
        product: 'codex',
        cost_basis: 'none',
        cost_usd: null,
        at: '2026-11-11T03:20:00.000Z',
      }),
      buildMockRequestReadRow({
        session_id: 'telemetry:session:s-unpaid',
        product: 'codex',
        cost_basis: 'none',
        cost_usd: null,
        at: '2026-11-11T03:20:00.000Z',
      }),
    ],
    turns: [
      {
        session_id: 'telemetry:session:s-paid',
        origin_issuer: 'https://broker.example',
        origin_subject: 'imp-builder',
        product: 'codex',
        model: null,
        cost_usd: 1,
        at: '2026-11-11T03:21:00.000Z',
      },
    ],
    pullRequests: [],
  });

  expect(cost.totals).toStrictEqual({
    requests: 2,
    costUSD: 1,
    reworkCostUSD: 0,
    requestsWithoutCost: 1,
  });
});

test('it gives the cost so far, with no landing time, for an item whose pull request has not merged', () => {
  const cost = buildCostToLand({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    attempts: [buildMockAttemptReadRow({ phase: 'triage' })],
    bindings: [],
    requests: [],
    turns: [],
    pullRequests: [{ id: 'github:pull_request:9001', merged_at: null }],
  });

  expect(cost).toStrictEqual({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    landedAt: null,
    attempts: 1,
    lines: [],
    totals: { requests: 0, costUSD: 0, reworkCostUSD: 0, requestsWithoutCost: 0 },
  });
});

test('it gives the empty value that the cost schema accepts for an item pepys holds no fact of', () => {
  const cost = buildCostToLand({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    attempts: [],
    bindings: [],
    requests: [],
    turns: [],
    pullRequests: [],
  });

  expect(costToLandSchema.parse(cost)).toStrictEqual({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    landedAt: null,
    attempts: 0,
    lines: [],
    totals: { requests: 0, costUSD: 0, reworkCostUSD: 0, requestsWithoutCost: 0 },
  });
});

test('it throws for a request with a cost basis the query does not know', () => {
  const parts = {
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    attempts: [buildMockAttemptReadRow({ id: 'boxxy:attempt:a2' })],
    bindings: [buildMockBindingReadRow({ attempt_id: 'boxxy:attempt:a2' })],
    requests: [buildMockRequestReadRow({ cost_basis: 'estimated' })],
    turns: [],
    pullRequests: [],
  };

  expect(() => buildCostToLand(parts)).toThrowWithMessage(Error, /cost basis estimated/u);
});
