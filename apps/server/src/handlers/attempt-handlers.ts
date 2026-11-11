import {
  bindAttemptSession,
  closeOutAttempt,
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
import { toWireJSON } from './to-wire-json.ts';

const noAttempt = { kind: 'refused', reason: 'no-attempt' } as const;

// The procedures of a session and its hooks. Each takes its session and caller from the root
// middleware's proven call, never from the request; the request names only the attempt.
export const attemptHandlers = {
  current: api.attempt.current.handler(async (options) => {
    const context = options.context;

    if (context.call === null) {
      return noAttempt;
    }

    const call = context.call;

    const latest = await context.deps.store.read((tx) => tx.findAttemptBySession(call.session));

    if (latest === null) {
      return noAttempt;
    }

    const picked = pickCallAttempt(latest, { ...call, attempt: latest.id });

    if (picked.kind === 'refused') {
      return picked;
    }

    return readCurrent(context.deps, picked.attempt);
  }),
  closeOut: api.attempt.closeOut.handler((options) => {
    const input = options.input;
    const deps = options.context.deps;
    const call = buildCallRef(options.context.call, input.session.attempt);

    if (call === null) {
      return noAttempt;
    }

    return closeOutAttempt({
      store: deps.store,
      call,
      body: input.closeOut,
      rules: deps.rulesState().rules,
      now: deps.clock.now(),
      newId: deps.newId,
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
