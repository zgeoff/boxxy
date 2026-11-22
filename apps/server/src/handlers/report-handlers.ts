import type { ItemId, PepysAnswer, PepysReader } from '@boxxy/model';
import type { ServerDeps } from '../types.ts';
import { api } from './api.ts';
import { resolveItemID } from './resolve-item-id.ts';

// The two reads of pepys. A server with no pepys section answers PEPYS_NOT_CONFIGURED; a pepys
// that does not answer is PEPYS_UNAVAILABLE. `behind` counts the item's facts that the outbox has
// not sent, from boxxy's own store.
export const reportHandlers = {
  cost: api.report.cost.handler(async (options) => {
    const item = options.input.item;

    const report = await readReport(options.context.deps, item, (pepys, id) =>
      pepys.readCostToLand(id),
    );

    return report.kind === 'value'
      ? { ...report.value, item: report.item, behind: report.behind }
      : throwReportError(report, options.errors, item);
  }),
  stageTimes: api.report.stageTimes.handler(async (options) => {
    const item = options.input.item;

    const report = await readReport(options.context.deps, item, (pepys, id) =>
      pepys.readStageTime(id),
    );

    return report.kind === 'value'
      ? { ...report.value, item: report.item, behind: report.behind }
      : throwReportError(report, options.errors, item);
  }),
};

type Report<Value> =
  | {
      readonly kind: 'value';
      readonly item: ItemId;
      readonly value: Value;
      readonly behind: { readonly facts: number; readonly oldestAt: number | null };
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'unavailable'; readonly reason: string };

async function readReport<Value>(
  deps: ServerDeps,
  rawItem: string,
  read: (pepys: PepysReader, item: ItemId) => Promise<PepysAnswer<Value>>,
): Promise<Report<Value>> {
  const now = deps.clock.now();
  const rules = deps.rulesState().rules;

  const found = await deps.store.read(async (tx) => {
    const id = await resolveItemID(tx, rawItem);

    if (id === null) {
      return null;
    }

    const [view, behind] = await Promise.all([tx.readItem(id, now, rules), tx.readItemBehind(id)]);

    return view === null ? null : { id, behind };
  });

  if (found === null) {
    return { kind: 'not-found' };
  }

  if (deps.pepys === null) {
    return { kind: 'not-configured' };
  }

  const answer = await read(deps.pepys, found.id);

  return answer.kind === 'value'
    ? { kind: 'value', item: found.id, value: answer.value, behind: found.behind }
    : { kind: 'unavailable', reason: answer.reason };
}

interface NotFoundOptions {
  readonly data: { readonly item: string };
}

interface UnavailableOptions {
  readonly data: { readonly reason: string };
}

interface ReportErrors {
  readonly NOT_FOUND: (options: NotFoundOptions) => Error;
  readonly PEPYS_NOT_CONFIGURED: () => Error;
  readonly PEPYS_UNAVAILABLE: (options: UnavailableOptions) => Error;
}

// The contract's error constructors carry the contract's message, which a bare `ORPCError` would
// drop; a lowercase name keeps the call clear of the `new-cap` lint.
function throwReportError(
  report: Exclude<Report<unknown>, { kind: 'value' }>,
  errors: ReportErrors,
  item: string,
): never {
  const notFound = errors.NOT_FOUND;
  const notConfigured = errors.PEPYS_NOT_CONFIGURED;
  const unavailable = errors.PEPYS_UNAVAILABLE;

  if (report.kind === 'not-found') {
    throw notFound({ data: { item } });
  }

  if (report.kind === 'not-configured') {
    throw notConfigured();
  }

  throw unavailable({ data: { reason: report.reason } });
}
