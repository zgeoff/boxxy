import { buildWaitOverdueReason } from '@boxxy/model';
import type {
  Instant,
  ItemId,
  ItemRules,
  ItemWithLevers,
  PhaseName,
  WaitNoticeMark,
} from '@boxxy/model';
import { timeouts } from '../timeouts.ts';

const hourMs = 3_600_000;

export interface WaitNoticeDraft {
  readonly item: ItemId;
  readonly phase: PhaseName;

  // the stay's start, which the mark of the notice records
  readonly since: Instant;
  readonly reason: string;
}

// The notices that items owe for waiting too long at a step. A stay owes at most one: the mark of
// the stay stops a second. A stay whose start is unknown owes none, because its length is unknown.
export function collectWaitNotices(
  items: readonly ItemWithLevers[],
  rules: ItemRules,
  marks: readonly WaitNoticeMark[],
  now: Instant,
): WaitNoticeDraft[] {
  return items.flatMap((item) => {
    const position = item.position;

    if (
      item.derived.state !== 'waiting' ||
      !item.derived.reason.startsWith('wait:') ||
      position.kind !== 'phase' ||
      item.positionSince === null
    ) {
      return [];
    }

    const since = item.positionSince;
    const kind = item.derived.reason.slice('wait:'.length);

    const step = rules.kinds
      .get(item.kind)
      ?.pipeline.steps.find((candidate) => candidate.phase === position.phase);

    const hours = step?.waitNoticeHours ?? timeouts.waitNoticeHours;
    const isNoticed = marks.some((mark) => mark.itemId === item.id && mark.since === since);

    if (isNoticed || now - since <= hours * hourMs) {
      return [];
    }

    return [
      { item: item.id, phase: position.phase, since, reason: buildWaitOverdueReason(kind, hours) },
    ];
  });
}
