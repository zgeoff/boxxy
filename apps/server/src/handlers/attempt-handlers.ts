import {
  bindAttemptSession,
  closeOutCall,
  linkPullRequest,
  pickCallAttempt,
} from '@boxxy/dispatch';
import type { CallRef } from '@boxxy/dispatch';
import type {
  AttemptRow,
  EvidenceKind,
  ItemKindName,
  LoadedRules,
  StoreChange,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { ProvenCall, ServerDeps } from '../types.ts';
import { api } from './api.ts';
import { collectItemPage } from './collect-item-page.ts';
import { toWireJSON } from './to-wire-json.ts';

const noAttempt = { kind: 'refused', reason: 'no-attempt' } as const;

// The procedures of a session and its hooks. Each takes its session and caller from the root
// middleware's proven call, never from the request; the request names only the attempt.
export const attemptHandlers = {
  current: api.attempt.current.handler(async (options) => {
    const attempt = await readSessionAttempt(options.context.deps, options.context.call);

    return attempt === null ? noAttempt : readCurrent(options.context.deps, attempt);
  }),

  // The reads of other items. The repo comes from the item of the session's own attempt, never
  // from the request, and a held item is the owner's draft, so the session never sees one.
  listItems: api.attempt.listItems.handler(async (options) => {
    const input = options.input;
    const deps = options.context.deps;

    const attempt = await readSessionAttempt(deps, options.context.call);

    if (attempt === null) {
      return noAttempt;
    }

    const now = deps.clock.now();
    const rules = deps.rulesState().rules;

    const listed = await deps.store.read(async (tx) => {
      const own = await tx.readItem(attempt.item, now, rules);

      if (own === null) {
        return null;
      }

      const items = await tx.listItems(
        { repo: own.repo, ...(input.state === undefined ? {} : { state: input.state }) },
        now,
        rules,
      );

      const entries = await Promise.all(
        items
          .filter((item) => item.derived.state !== 'held')
          .map(async (item) => ({ item, notes: await tx.listItemNotes(item.id) })),
      );

      return { repo: own.repo, entries };
    });

    if (listed === null) {
      return noAttempt;
    }

    return { kind: 'items' as const, repo: listed.repo, ...collectItemPage(listed.entries, input) };
  }),
  getItem: api.attempt.getItem.handler(async (options) => {
    const input = options.input;
    const notFound = options.errors.NOT_FOUND;
    const deps = options.context.deps;

    const attempt = await readSessionAttempt(deps, options.context.call);

    if (attempt === null) {
      return noAttempt;
    }

    const now = deps.clock.now();
    const rules = deps.rulesState().rules;
    const item = brandSchemas.itemId.safeParse(input.item);

    const read = await deps.store.read(async (tx) => {
      const own = await tx.readItem(attempt.item, now, rules);

      const detail = item.success ? await tx.readItemDetail(item.data, now, rules) : null;

      return { own, detail };
    });

    if (read.own === null) {
      return noAttempt;
    }

    const detail = read.detail;

    // a held item or one of another repo answers as an item that does not exist, so the answer
    // never shows that it exists
    if (
      detail === null ||
      detail.item.repo !== read.own.repo ||
      detail.item.derived.state === 'held'
    ) {
      throw notFound({ data: { item: input.item } });
    }

    const { levers: _levers, ...view } = detail.item;

    return {
      kind: 'item' as const,
      item: view,
      notes: [...detail.notes],
      relations: [...detail.relations],
      pullRequests: [...detail.pullRequests],
    };
  }),
  closeOut: api.attempt.closeOut.handler((options) => {
    const input = options.input;
    const deps = options.context.deps;
    const call = buildCallRef(options.context.call, input.session.attempt);

    if (call === null) {
      return noAttempt;
    }

    return closeOutCall({
      store: deps.store,
      call,
      body: input.closeOut,
      rules: deps.rulesState().rules,
      now: deps.clock.now(),
      newId: deps.newId,
      review: deps.review,
    });
  }),
  evidence: api.attempt.evidence.handler((options) => {
    const input = options.input;
    const context = options.context;
    const call = buildCallRef(context.call, input.session.attempt);

    if (call === null) {
      return noAttempt;
    }

    return writeEvidence(context.deps, call, {
      kind: input.kind,
      ref: input.ref,
      observed: input.observed ?? null,
    });
  }),
  bindSession: api.attempt.bindSession.handler(async (options) => {
    const input = options.input;
    const context = options.context;
    const call = buildCallRef(context.call, input.session.attempt);
    const agentSession = brandSchemas.agentSessionId.safeParse(input.session.agentSession);

    if (call === null || !agentSession.success) {
      return { kind: 'no-attempt' } as const;
    }

    const answer = await bindAttemptSession({
      store: context.deps.store,
      call,
      agentSession: agentSession.data,
      missingSkills: input.missingSkills ?? [],
      now: context.deps.clock.now(),
      newId: context.deps.newId,
    });

    if (answer.kind !== 'fault') {
      return answer;
    }

    context.deps.log.warn('an agent session is bound to another attempt', {
      attempt: answer.attempt,
      holder: answer.holder,
    });

    return { kind: 'fault', fault: answer.fault, holder: answer.holder } as const;
  }),
  recordPullRequest: api.attempt.recordPullRequest.handler((options) => {
    const input = options.input;
    const deps = options.context.deps;
    const call = buildCallRef(options.context.call, input.session.attempt);

    if (call === null) {
      return noAttempt;
    }

    if (deps.forge === null) {
      return { kind: 'retry' } as const;
    }

    return linkPullRequest({
      store: deps.store,
      forge: deps.forge,
      rules: deps.rulesState().rules,
      call,
      url: input.url,
      now: deps.clock.now(),
      newId: deps.newId,
    });
  }),
};

// The latest attempt of the proven session, when its own row holds the proven caller.
async function readSessionAttempt(
  deps: ServerDeps,
  call: ProvenCall | null,
): Promise<AttemptRow | null> {
  if (call === null) {
    return null;
  }

  const latest = await deps.store.read((tx) => tx.findAttemptBySession(call.session));

  if (latest === null) {
    return null;
  }

  const picked = pickCallAttempt(latest, { ...call, attempt: latest.id });

  return picked.kind === 'attempt' ? picked.attempt : null;
}

async function readCurrent(deps: ServerDeps, attempt: AttemptRow) {
  const rules = deps.rulesState().rules;
  const now = deps.clock.now();

  const [item, notes] = await deps.store.read((tx) =>
    Promise.all([tx.readItem(attempt.item, now, rules), tx.listItemNotes(attempt.item)]),
  );

  const phase = rules.phases.get(attempt.phase);

  if (item === null || phase === undefined) {
    return noAttempt;
  }

  return {
    kind: 'attempt' as const,
    attempt,
    item,
    input: toWireJSON(attempt.input),
    closeOut: {
      phase: attempt.phase,
      schema: toWireJSON(phase.closeOut.jsonSchema),
      outcomes: [...phase.outcomes],
    },
    skills: { pin: rules.skills, names: collectSkillNames(rules, item.kind, attempt) },
    notes: notes.map((note) => ({ seq: note.seq, text: note.text, at: note.at })),
  };
}

function collectSkillNames(rules: LoadedRules, kind: ItemKindName, attempt: AttemptRow): string[] {
  const recipes = rules.kinds.get(kind)?.recipes ?? {};

  const name =
    (attempt.mode === 'attended' ? recipes[`${attempt.phase}/attended`] : undefined) ??
    recipes[attempt.phase];

  return name === undefined ? [] : [...(rules.recipes.get(name)?.recipe.skills ?? [])];
}

// an attempt ID that no store holds, so `pickCallAttempt` answers `not-current`
const missingAttemptId = '00000000-0000-7000-8000-000000000000';

// The attempt ID from the request, with the session and the caller that the middleware proved.
// A string that is no attempt ID names no attempt of the session.
function buildCallRef(proven: ProvenCall | null, attempt: string): CallRef | null {
  const parsed = brandSchemas.attemptId.safeParse(attempt);

  if (proven === null) {
    return null;
  }

  return {
    attempt: parsed.success ? parsed.data : brandSchemas.attemptId.parse(missingAttemptId),
    session: proven.session,
    caller: proven.caller,
  };
}

interface EvidenceDraft {
  readonly kind: Exclude<EvidenceKind, 'pull_request' | 'commit'>;
  readonly ref: string;
  readonly observed: string | null;
}

// Writes under the attempt's lease, so the evidence of a settled attempt is refused.
function writeEvidence(deps: ServerDeps, call: CallRef, draft: EvidenceDraft) {
  return deps.store.exclusive(async (tx) => {
    const latest = await tx.findAttemptBySession(call.session);

    const picked = pickCallAttempt(latest, call);

    if (picked.kind === 'refused') {
      return picked;
    }

    const attempt = picked.attempt;
    const factId = brandSchemas.factId.parse(deps.newId());
    const at = deps.clock.now();

    const result = await tx.applyChange({
      at,
      under: buildUnder(attempt),
      writes: [
        {
          op: 'insert',
          table: 'evidence',
          row: { factId, attempt: attempt.id, ...draft, source: 'agent', at },
        },
      ],
      facts: [
        {
          id: factId,
          type: 'boxxy.evidence.recorded',
          entity: `boxxy:item:${attempt.item}`,
          actor: `boxxy:attempt:${attempt.id}`,
          payload: { attempt: attempt.id, ...draft },
        },
      ],
    });

    return result.kind === 'applied'
      ? ({ kind: 'recorded', factId } as const)
      : ({ kind: 'refused', reason: 'not-current' } as const);
  });
}

function buildUnder(attempt: AttemptRow): NonNullable<StoreChange['under']> {
  return { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen };
}
