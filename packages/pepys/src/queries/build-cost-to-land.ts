import type { CostToLand } from '@boxxy/model';
import { noCapacityFailure } from './constants.ts';
import type {
  AttemptReadRow,
  BindingReadRow,
  PullRequestReadRow,
  RequestReadRow,
  TurnReadRow,
} from './types.ts';

interface CostParts {
  readonly item: string;
  readonly attempts: readonly AttemptReadRow[];
  readonly bindings: readonly BindingReadRow[];
  readonly requests: readonly RequestReadRow[];
  readonly turns: readonly TurnReadRow[];
  readonly pullRequests: readonly PullRequestReadRow[];
}

// What one item cost to land, from the rows its statements read. Every attempt of the item counts,
// whatever its state or outcome, but a `no-capacity` one. Each telemetry row counts for at most one
// attempt, by the rule of `findOwner`.
export function buildCostToLand(parts: CostParts): CostToLand {
  const attempts = parts.attempts.filter((attempt) => attempt.failure !== noCapacityFailure);
  const owners = { attempts, bindings: parts.bindings };
  const requestLines = collectRequestLines(owners, parts.requests);
  const turnLines = collectTurnLines(owners, parts.turns);
  const lines = [...requestLines, ...turnLines];

  return {
    item: parts.item,
    landedAt: findLandedAt(parts.pullRequests),
    attempts: attempts.length,
    lines,
    totals: {
      requests: sumOf(lines.map((line) => line.requests)),
      costUSD: sumOf(lines.map((line) => line.costUSD ?? 0)),
      reworkCostUSD: sumOf(lines.filter((line) => line.rework).map((line) => line.costUSD ?? 0)),
      requestsWithoutCost: countRequestsWithoutCost(requestLines, turnLines),
    },
  };
}

type CostLine = CostToLand['lines'][number];

interface Owners {
  readonly attempts: readonly AttemptReadRow[];
  readonly bindings: readonly BindingReadRow[];
}

// One line per phase, rework flag, product, model and cost basis. A group whose every cost is
// unknown has a null cost, never 0.
function collectRequestLines(owners: Owners, requests: readonly RequestReadRow[]): CostLine[] {
  const lines = new Map<string, CostLine>();

  for (const request of requests) {
    const attempt = findOwner(owners, request);

    if (attempt !== undefined) {
      const costBasis = pickRequestBasis(request.cost_basis);
      const rework = attempt.round > 1;

      const key = JSON.stringify([
        attempt.phase,
        rework,
        request.product,
        request.model,
        costBasis,
      ]);

      const line = lines.get(key) ?? {
        phase: attempt.phase,
        rework,
        product: request.product,
        model: request.model,
        requests: 0,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 0,
        costUSD: null,
        costBasis,
      };

      lines.set(key, {
        ...line,
        requests: line.requests + 1,
        inputTokens: line.inputTokens + request.input_tokens,
        cacheReadTokens: line.cacheReadTokens + request.cache_read_tokens,
        cacheCreationTokens: line.cacheCreationTokens + request.cache_creation_tokens,
        outputTokens: line.outputTokens + request.output_tokens,
        costUSD: request.cost_usd === null ? line.costUSD : (line.costUSD ?? 0) + request.cost_usd,
      });
    }
  }

  return [...lines.values()].toSorted(compareLines);
}

interface TelemetryRow {
  readonly session_id: string;
  readonly origin_issuer: string | null;
  readonly origin_subject: string | null;
  readonly at: string;
}

// The attempt that owns the row's time in its session, when the row's proven origin is that
// attempt's caller. Times compare as instants: GitHub and some telemetry write `…:00Z`, and boxxy
// `…:00.000Z`, so a text compare would misorder them.
function findOwner(owners: Owners, row: TelemetryRow): AttemptReadRow | undefined {
  const bindings = owners.bindings
    .filter((binding) => binding.session_id === row.session_id)
    .toSorted(
      (left, right) =>
        Date.parse(left.bound_at) - Date.parse(right.bound_at) ||
        compareText(left.attempt_id, right.attempt_id),
    );

  const at = Date.parse(row.at);
  const owner = bindings.findLast((binding) => Date.parse(binding.bound_at) <= at) ?? bindings[0];

  if (
    owner === undefined ||
    owner.caller_issuer === null ||
    owner.caller_issuer !== row.origin_issuer ||
    owner.caller_subject !== row.origin_subject
  ) {
    return undefined;
  }

  return owners.attempts.find((attempt) => attempt.id === owner.attempt_id);
}

function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

// `reported` and `none` are the values of the telemetry table's `cost_basis`.
function pickRequestBasis(basis: string): 'reported' | 'none' {
  if (basis === 'reported' || basis === 'none') {
    return basis;
  }

  throw new Error(
    `a model request has the cost basis ${basis}, which the cost query does not know`,
  );
}

// phase, rework, product, model with a null model first, then the cost basis
function compareLines(left: CostLine, right: CostLine): number {
  return (
    compareText(left.phase, right.phase) ||
    Number(left.rework) - Number(right.rework) ||
    compareText(left.product, right.product) ||
    compareText(left.model ?? '', right.model ?? '') ||
    compareText(left.costBasis, right.costBasis)
  );
}

// One `turn` line per phase, rework flag, product and model: a turn cost has no token count.
function collectTurnLines(owners: Owners, turns: readonly TurnReadRow[]): CostLine[] {
  const lines = new Map<string, CostLine>();

  for (const turn of turns) {
    const attempt = findOwner(owners, turn);

    if (attempt !== undefined) {
      const rework = attempt.round > 1;
      const key = JSON.stringify([attempt.phase, rework, turn.product, turn.model]);
      const line = lines.get(key);

      lines.set(key, {
        phase: attempt.phase,
        rework,
        product: turn.product,
        model: turn.model,
        requests: 0,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 0,
        costUSD: (line?.costUSD ?? 0) + turn.cost_usd,
        costBasis: 'turn',
      });
    }
  }

  return [...lines.values()].toSorted(compareLines);
}

// The earliest merge of a pull request that an attempt of the item produced: when the item
// landed. null: it has not landed, and the lines are its cost so far.
function findLandedAt(pullRequests: readonly PullRequestReadRow[]): string | null {
  const merges = pullRequests
    .map((pullRequest) => pullRequest.merged_at)
    .filter((mergedAt) => mergedAt !== null)
    .toSorted((left, right) => Date.parse(left) - Date.parse(right));

  return merges[0] ?? null;
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

// The requests on `none` lines whose phase, rework flag and product have no `turn` line, of any
// model: their cost is in neither table, and above 0 the total is a lower bound.
function countRequestsWithoutCost(
  requestLines: readonly CostLine[],
  turnLines: readonly CostLine[],
): number {
  const covered = new Set(
    turnLines.map((line) => JSON.stringify([line.phase, line.rework, line.product])),
  );

  return sumOf(
    requestLines
      .filter((line) => line.costBasis === 'none')
      .filter((line) => !covered.has(JSON.stringify([line.phase, line.rework, line.product])))
      .map((line) => line.requests),
  );
}
