import {
  bindAttemptSession,
  closeOutCall,
  linkPullRequest,
  pickCallAttempt,
  recordEvidence,
} from '@boxxy/dispatch';
import type { CallRef, EvidenceDraft } from '@boxxy/dispatch';
import type { AttemptRow, ItemView, LoadedRules, RepoName } from '@boxxy/model';
import { brandSchemas, findRecipeName } from '@boxxy/model';
import { verifyGateCheck } from '../constants.ts';
import type { ProvenCall, ServerDeps } from '../types.ts';
import { api } from './api.ts';
import { collectItemPage } from './collect-item-page.ts';
import { resolveItemID } from './resolve-item-id.ts';
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

    const page = collectItemPage(listed.entries, input);

    return {
      kind: 'items' as const,
      repo: listed.repo,
      items: page.items.map((item) => {
        const { keptSession: _keptSession, ...view } = item;

        return view;
      }),
      next: page.next,
    };
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

    const read = await deps.store.read(async (tx) => {
      const own = await tx.readItem(attempt.item, now, rules);
      const item = await resolveItemID(tx, input.item);

      const detail = item === null ? null : await tx.readItemDetail(item, now, rules);

      // the other end of each relation, so a relation to an item the session cannot see stays out
      const ends = await Promise.all(
        (detail?.relations ?? []).map((relation) => {
          const other = relation.source === detail?.item.id ? relation.target : relation.source;

          return tx.readItem(other, now, rules);
        }),
      );

      return { own, detail, ends };
    });

    if (read.own === null) {
      return noAttempt;
    }

    const own = read.own;
    const detail = read.detail;

    // a held item or one of another repo answers as an item that does not exist, so the answer
    // never shows that it exists
    if (detail === null || !isSessionVisible(detail.item, own.repo)) {
      throw notFound({ data: { item: input.item } });
    }

    const { levers: _levers, keptSession: _keptSession, ...view } = detail.item;

    return {
      kind: 'item' as const,
      item: view,
      notes: [...detail.notes],
      relations: detail.relations.filter((_relation, index) =>
        isSessionVisible(read.ends[index] ?? null, own.repo),
      ),
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
      forge: deps.forge,
    });
  }),
  evidence: api.attempt.evidence.handler((options) => {
    const input = options.input;
    const context = options.context;
    const call = buildCallRef(context.call, input.session.attempt);

    if (call === null) {
      return noAttempt;
    }

    const deps = context.deps;

    return recordEvidence({
      store: deps.store,
      forge: deps.forge,
      verifier: deps.verifier,
      gateCheck: verifyGateCheck,
      rules: deps.rulesState().rules,
      call,
      draft: toEvidenceDraft(input),
      now: deps.clock.now(),
      newId: deps.newId,
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
    skills: { pin: rules.skills, names: collectSkillNames(rules, item, attempt) },
    notes: notes.map((note) => ({ seq: note.seq, text: note.text, at: note.at })),
  };
}

function collectSkillNames(
  rules: LoadedRules,
  item: Pick<ItemView, 'kind' | 'repo'>,
  attempt: AttemptRow,
): string[] {
  const name = findRecipeName(rules, item, attempt.phase, attempt.mode);

  return name === undefined ? [] : [...(rules.recipes.get(name)?.recipe.skills ?? [])];
}

// A session sees an item of its own repo that is not held.
function isSessionVisible(item: ItemView | null, repo: RepoName): boolean {
  return item !== null && item.repo === repo && item.derived.state !== 'held';
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

interface EvidenceInput {
  readonly kind: 'test' | 'ci-run' | 'live-check' | 'check' | 'verdict';
  readonly ref: string;
  readonly observed?: string | undefined;
}

// A check or a verdict names what to read, so it carries no observed text; the contract refuses one
// that sends it.
function toEvidenceDraft(input: EvidenceInput): EvidenceDraft {
  return input.kind === 'check' || input.kind === 'verdict'
    ? { kind: input.kind, ref: input.ref }
    : { kind: input.kind, ref: input.ref, observed: input.observed ?? null };
}
