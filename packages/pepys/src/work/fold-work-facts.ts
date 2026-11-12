import type {
  AttemptClaimedFact,
  AttemptFold,
  AttemptMarkFact,
  AttemptSessionFact,
  AttemptSettledFact,
  ItemClosedFact,
  ItemEditedFact,
  ItemFiledFact,
  ItemFold,
  PassedOverFact,
  PullRequestFold,
  SessionFold,
  SleepStretch,
  WorkFact,
  WorkFold,
} from './types.ts';

// a fact's place in time: its time, then its fact ID
interface Stamp {
  at: string;
  id: string;
}

interface SessionDraft {
  session: string;
  key: 'atc' | 'agent';
  product: string | null;
  at: string;
  id: string;
}

interface PullRequestDraft {
  id: string;
  at: string;
  evidence: string;
}

interface AttemptDraft {
  id: string;
  claimed: AttemptClaimedFact | undefined;

  // the earliest `started` or `reconciled`: the start time and the atc session
  started: AttemptSessionFact | undefined;

  // the latest `started`, `reconciled` or `resumed`: the caller
  caller: AttemptSessionFact | undefined;
  closedOut: AttemptMarkFact | undefined;
  settled: AttemptSettledFact | undefined;
  slept: Stamp[];
  woken: Stamp[];
  sessions: SessionDraft[];
  pullRequests: PullRequestDraft[];
  updatedAt: string;
}

interface TextEdit {
  value: string;
  at: string;
  id: string;
}

interface ItemDraft {
  filed: ItemFiledFact | undefined;
  title: TextEdit | undefined;
  kind: TextEdit | undefined;
  designMode: TextEdit | undefined;
  closed: ItemClosedFact | undefined;
}

// Two facts with one time are ordered by fact ID, so every arrival order gives the same fold.
// scriptc compiles this file into the consumer, so it uses loops, plain objects and text
// compares, and no Map, Set or Date.
export function foldWorkFacts(facts: readonly WorkFact[]): WorkFold {
  const item: ItemDraft = {
    filed: undefined,
    title: undefined,
    kind: undefined,
    designMode: undefined,
    closed: undefined,
  };

  const attempts: AttemptDraft[] = [];

  for (const fact of facts) {
    if (fact.type === 'boxxy.item.filed') {
      if (item.filed === undefined || isEarlier(fact, item.filed)) {
        item.filed = fact;
      }
    } else if (fact.type === 'boxxy.item.edited') {
      layEdit(item, fact);
    } else if (fact.type === 'boxxy.item.closed') {
      if (item.closed === undefined || isEarlier(item.closed, fact)) {
        item.closed = fact;
      }
    } else if (fact.type === 'boxxy.attempt.claimed') {
      layClaimed(getDraft(attempts, fact.payload.attempt, fact.at), fact);
    } else if (
      fact.type === 'boxxy.attempt.started' ||
      fact.type === 'boxxy.attempt.reconciled' ||
      fact.type === 'boxxy.attempt.resumed'
    ) {
      laySession(getDraft(attempts, fact.payload.attempt, fact.at), fact);
    } else if (fact.type === 'boxxy.attempt.session_bound') {
      const draft = getDraft(attempts, fact.payload.attempt, fact.at);

      // the atc row too: `started` may be a parked outbox row that arrives later, or never
      bindSession(draft, {
        session: toTelemetrySession(fact.payload.atcSession),
        key: 'atc',
        product: null,
        at: fact.at,
        id: fact.id,
      });

      bindSession(draft, {
        session: fact.payload.agentSession,
        key: 'agent',
        product: fact.payload.product,
        at: fact.at,
        id: fact.id,
      });
    } else if (fact.type === 'boxxy.attempt.slept') {
      getDraft(attempts, fact.payload.attempt, fact.at).slept.push({ at: fact.at, id: fact.id });
    } else if (fact.type === 'boxxy.attempt.woken') {
      getDraft(attempts, fact.payload.attempt, fact.at).woken.push({ at: fact.at, id: fact.id });
    } else if (fact.type === 'boxxy.attempt.closed_out') {
      layClosedOut(getDraft(attempts, fact.payload.attempt, fact.at), fact);
    } else if (fact.type === 'boxxy.attempt.settled') {
      laySettled(getDraft(attempts, fact.payload.attempt, fact.at), fact);
    } else if (fact.type === 'boxxy.pull_request.linked') {
      const draft = getDraft(attempts, fact.payload.attempt, fact.at);

      linkPullRequest(draft, { id: fact.payload.pullRequestId, at: fact.at, evidence: fact.id });
    } else {
      // scriptc compiles a copy of `src` alone, so no `ts-pattern`: a new member of the union that
      // no branch takes fails the type check here.
      fact.type satisfies PassedOverFact['type'];
    }
  }

  return { item: buildItemFold(item), attempts: collectAttemptFolds(attempts) };
}

function isEarlier(left: Stamp, right: Stamp): boolean {
  return left.at < right.at || (left.at === right.at && left.id < right.id);
}

// Each field of an edit is laid over the row by itself: the latest edit that names the field wins.
function layEdit(item: ItemDraft, fact: ItemEditedFact): void {
  const at = fact.at;
  const id = fact.id;
  const payload = fact.payload;

  if (typeof payload.title === 'string') {
    item.title = pickLaterEdit(item.title, { value: payload.title, at, id });
  }

  if (typeof payload.kind === 'string') {
    item.kind = pickLaterEdit(item.kind, { value: payload.kind, at, id });
  }

  const designMode = findDesignMode(payload.fields);

  if (designMode !== null) {
    item.designMode = pickLaterEdit(item.designMode, { value: designMode, at, id });
  }
}

function pickLaterEdit(current: TextEdit | undefined, next: TextEdit): TextEdit {
  return current === undefined || isEarlier(current, next) ? next : current;
}

function findDesignMode(fields: unknown): string | null {
  if (typeof fields !== 'object' || fields === null || !('designMode' in fields)) {
    return null;
  }

  return typeof fields.designMode === 'string' ? fields.designMode : null;
}

function layClaimed(draft: AttemptDraft, fact: AttemptClaimedFact): void {
  if (draft.claimed === undefined || isEarlier(fact, draft.claimed)) {
    draft.claimed = fact;
  }
}

// The draft of one attempt, made on first sight and kept in attempt ID order.
function getDraft(drafts: AttemptDraft[], id: string, at: string): AttemptDraft {
  for (const draft of drafts) {
    if (draft.id === id) {
      if (draft.updatedAt < at) {
        draft.updatedAt = at;
      }

      return draft;
    }
  }

  const draft: AttemptDraft = {
    id,
    claimed: undefined,
    started: undefined,
    caller: undefined,
    closedOut: undefined,
    settled: undefined,
    slept: [],
    woken: [],
    sessions: [],
    pullRequests: [],
    updatedAt: at,
  };

  drafts.push(draft);

  for (let index = drafts.length - 1; index > 0; index -= 1) {
    const before = drafts[index - 1];

    if (before === undefined || before.id < id) {
      break;
    }

    drafts[index] = before;
    drafts[index - 1] = draft;
  }

  return draft;
}

// A wake keeps the session, so `resumed` names the atc session the attempt already has, unless
// the worker answered with a new one. It sets the caller but not the start.
function laySession(draft: AttemptDraft, fact: AttemptSessionFact): void {
  const isStart = fact.type !== 'boxxy.attempt.resumed';

  if (isStart && (draft.started === undefined || isEarlier(fact, draft.started))) {
    draft.started = fact;
  }

  if (draft.caller === undefined || isEarlier(draft.caller, fact)) {
    draft.caller = fact;
  }

  bindSession(draft, {
    session: toTelemetrySession(fact.payload.atcSession),
    key: 'atc',
    product: null,
    at: fact.at,
    id: fact.id,
  });
}

// One row per session of the attempt: the earliest fact that names the session gives its key,
// product, time and evidence.
function bindSession(draft: AttemptDraft, binding: SessionDraft): void {
  for (let index = 0; index < draft.sessions.length; index += 1) {
    const bound = draft.sessions[index];

    if (bound !== undefined && bound.session === binding.session) {
      if (isEarlier(binding, bound)) {
        draft.sessions[index] = binding;
      }

      return;
    }
  }

  draft.sessions.push(binding);

  for (let index = draft.sessions.length - 1; index > 0; index -= 1) {
    const before = draft.sessions[index - 1];

    if (before === undefined || before.session < binding.session) {
      break;
    }

    draft.sessions[index] = before;
    draft.sessions[index - 1] = binding;
  }
}

// atc stamps `atc.session.id` with the ID that the session's own host gives it, the last
// dot-separated part of the `<target>.<daemon>.<id>` form that a remote client is answered with.
function toTelemetrySession(atcSession: string): string {
  return atcSession.slice(atcSession.lastIndexOf('.') + 1);
}

function layClosedOut(draft: AttemptDraft, fact: AttemptMarkFact): void {
  if (draft.closedOut === undefined || isEarlier(fact, draft.closedOut)) {
    draft.closedOut = fact;
  }
}

function laySettled(draft: AttemptDraft, fact: AttemptSettledFact): void {
  if (draft.settled === undefined || isEarlier(fact, draft.settled)) {
    draft.settled = fact;
  }
}

// The hook and the watch may both link one pull request: one link, with the earliest fact as its
// evidence.
function linkPullRequest(draft: AttemptDraft, link: PullRequestDraft): void {
  for (let index = 0; index < draft.pullRequests.length; index += 1) {
    const linked = draft.pullRequests[index];

    if (linked !== undefined && linked.id === link.id) {
      if (isEarlier({ at: link.at, id: link.evidence }, { at: linked.at, id: linked.evidence })) {
        draft.pullRequests[index] = link;
      }

      return;
    }
  }

  draft.pullRequests.push(link);

  for (let index = draft.pullRequests.length - 1; index > 0; index -= 1) {
    const before = draft.pullRequests[index - 1];

    if (before === undefined || before.id < link.id) {
      break;
    }

    draft.pullRequests[index] = before;
    draft.pullRequests[index - 1] = link;
  }
}

// An item with no `filed` fact in the scope gives no item row.
function buildItemFold(item: ItemDraft): ItemFold | null {
  const filed = item.filed;

  if (filed === undefined) {
    return null;
  }

  let updatedAt = filed.at;

  for (const edit of [item.title, item.kind, item.designMode]) {
    if (edit !== undefined && updatedAt < edit.at) {
      updatedAt = edit.at;
    }
  }

  if (item.closed !== undefined && updatedAt < item.closed.at) {
    updatedAt = item.closed.at;
  }

  return {
    kind: item.kind === undefined ? filed.payload.kind : item.kind.value,
    repo: filed.payload.repo,
    title: item.title === undefined ? filed.payload.title : item.title.value,
    design_mode:
      item.designMode === undefined ? findDesignMode(filed.payload.fields) : item.designMode.value,
    filed_at: filed.at,
    closed_at: item.closed === undefined ? null : item.closed.at,
    close_reason: item.closed === undefined ? null : item.closed.payload.reason,
    updated_at: updatedAt,
  };
}

// An attempt with no `claimed` fact in the scope gives nothing: its row is parked in boxxy's
// outbox, or not sent yet, and the claimed fact marks the scope dirty when it arrives.
function collectAttemptFolds(drafts: readonly AttemptDraft[]): AttemptFold[] {
  const folds: AttemptFold[] = [];

  for (const draft of drafts) {
    const claimed = draft.claimed;

    if (claimed !== undefined) {
      folds.push(buildAttemptFold(draft, claimed));
    }
  }

  return folds;
}

function buildAttemptFold(draft: AttemptDraft, claimed: AttemptClaimedFact): AttemptFold {
  const settled = draft.settled;
  const caller = draft.caller === undefined ? null : draft.caller.payload.caller;

  return {
    id: draft.id,
    phase: claimed.payload.phase,
    number: claimed.payload.number,
    round: claimed.payload.round,
    mode: claimed.payload.mode,
    pool: claimed.payload.pool,
    recipe_hash: claimed.payload.recipeHash,
    rules_version: claimed.payload.rulesVersion,
    atc_session: draft.started === undefined ? null : draft.started.payload.atcSession,
    state: settled === undefined ? 'live' : settled.payload.state,
    outcome: settled === undefined ? null : settled.payload.outcome,
    failure: settled === undefined ? null : settled.payload.failure,
    claimed_at: claimed.at,
    started_at: draft.started === undefined ? null : draft.started.at,
    closed_out_at: draft.closedOut === undefined ? null : draft.closedOut.at,
    ended_at: settled === undefined ? null : settled.at,
    sleeps: pairSleeps(draft.slept, draft.woken, settled),
    updated_at: draft.updatedAt,
    claimedFact: claimed.id,
    sessions: collectSessionFolds(draft.sessions, caller),
    pullRequests: collectPullRequestFolds(draft.pullRequests),
  };
}

// Each sleep pairs with the earliest wake at or after it. The last sleep with no wake ends at the
// settle when the attempt settled asleep; else it is open, with `to` null. Times compare as text:
// boxxy writes every time in the one fixed form of an ISO 8601 UTC instant.
function pairSleeps(
  slept: readonly Stamp[],
  woken: readonly Stamp[],
  settled: AttemptSettledFact | undefined,
): SleepStretch[] {
  const sleeps = sortStamps(slept);
  const wakes = sortStamps(woken);
  const stretches: SleepStretch[] = [];
  let next = 0;

  for (let index = 0; index < sleeps.length; index += 1) {
    const sleep = sleeps[index];

    if (sleep !== undefined) {
      while (next < wakes.length && isBefore(wakes[next], sleep.at)) {
        next += 1;
      }

      const wake = wakes[next];

      if (wake === undefined) {
        const isLast = index === sleeps.length - 1;
        const endsAtSettle = isLast && settled !== undefined && settled.payload.asleep;

        stretches.push({ from: sleep.at, to: endsAtSettle ? settled.at : null });
      } else {
        stretches.push({ from: sleep.at, to: wake.at });

        next += 1;
      }
    }
  }

  return stretches;
}

function sortStamps(stamps: readonly Stamp[]): Stamp[] {
  const sorted: Stamp[] = [];

  for (const stamp of stamps) {
    sorted.push(stamp);

    for (let index = sorted.length - 1; index > 0; index -= 1) {
      const before = sorted[index - 1];

      if (before === undefined || isEarlier(before, stamp)) {
        break;
      }

      sorted[index] = before;
      sorted[index - 1] = stamp;
    }
  }

  return sorted;
}

function isBefore(stamp: Stamp | undefined, at: string): boolean {
  return stamp !== undefined && stamp.at < at;
}

// Every session row of the attempt holds the caller of its latest `started`, `reconciled` or
// `resumed`. With none, both columns are null, and no telemetry counts for the attempt.
function collectSessionFolds(
  sessions: readonly SessionDraft[],
  caller: { issuer: string; subject: string } | null,
): SessionFold[] {
  const folds: SessionFold[] = [];

  for (const bound of sessions) {
    folds.push({
      session: bound.session,
      key: bound.key,
      product: bound.product,
      caller_issuer: caller === null ? null : caller.issuer,
      caller_subject: caller === null ? null : caller.subject,
      bound_at: bound.at,
      evidence: bound.id,
    });
  }

  return folds;
}

function collectPullRequestFolds(links: readonly PullRequestDraft[]): PullRequestFold[] {
  const folds: PullRequestFold[] = [];

  for (const link of links) {
    folds.push({ id: link.id, evidence: link.evidence });
  }

  return folds;
}
