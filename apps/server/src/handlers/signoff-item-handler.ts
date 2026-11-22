import type { AttemptRow, ItemView, LeverRow, StoreReader } from '@boxxy/model';
import { findSignoffWait, signoffApproveLeverKind, signoffSendBackLeverKind } from '@boxxy/model';
import type { ServerDeps } from '../types.ts';
import { api } from './api.ts';
import { buildOwnerFact } from './build-owner-fact.ts';
import { readLastLeverSeq } from './read-last-lever-seq.ts';
import { resolveItemID } from './resolve-item-id.ts';

// The owner's answer to an item that waits for a sign-off. It checks and writes in one store
// change, so no second answer and no push can come between them.
export const signoffItemHandler = api.item.signoff.handler((options) => {
  const input = options.input;
  const deps = options.context.deps;
  const notFound = options.errors.NOT_FOUND;
  const itemHeld = options.errors.ITEM_HELD;
  const notAwaiting = options.errors.NOT_AWAITING_SIGNOFF;
  const staleHead = options.errors.STALE_HEAD;
  const findingsRequired = options.errors.FINDINGS_REQUIRED;

  return deps.store.exclusive(async (tx) => {
    const found = await readItem(tx, deps, input.item);

    if (found === null) {
      throw notFound({ data: { item: input.item } });
    }

    if (found.derived.state === 'held') {
      throw itemHeld();
    }

    if (found.derived.state === 'archived') {
      throw notAwaiting();
    }

    const attempts = await tx.listItemAttempts(found.id);

    const wait = findWait(deps, found, attempts);

    if (wait === null) {
      throw notAwaiting();
    }

    if (input.head !== wait.head) {
      throw staleHead({ data: { head: wait.head } });
    }

    const findings = input.findings?.trim() ?? '';

    if (input.verdict === 'send-back' && findings === '') {
      throw findingsRequired();
    }

    const now = deps.clock.now();
    const isApproval = input.verdict === 'approve';

    const lever: LeverRow = {
      seq: 0,
      kind: isApproval ? signoffApproveLeverKind : signoffSendBackLeverKind,
      item: found.id,
      until: null,
      expiresAt: null,
      reason: input.findings ?? null,
      phase: null,
      head: wait.head,
      actor: 'boxxy:owner:local',
      at: now,
    };

    await tx.applyChange({
      at: now,
      writes: [{ op: 'insert', table: 'levers', row: lever }],
      facts: [buildOwnerFact(deps, found.id, 'boxxy.lever.recorded', lever)],
    });

    return { lever: await readLastLeverSeq(tx, deps, found.id) };
  });
});

async function readItem(tx: StoreReader, deps: ServerDeps, raw: string): Promise<ItemView | null> {
  const id = await resolveItemID(tx, raw);

  return id === null ? null : tx.readItem(id, deps.clock.now(), deps.rulesState().rules);
}

function findWait(deps: ServerDeps, item: ItemView, attempts: readonly AttemptRow[]) {
  const pipeline = deps.rulesState().rules.kinds.get(item.kind)?.pipeline ?? null;

  return findSignoffWait({ pipeline, position: item.position, attempts });
}
