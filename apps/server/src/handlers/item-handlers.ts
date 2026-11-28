import { endItemAttempts, measureNewFactBytes, outboxLimits, requestWake } from '@boxxy/dispatch';
import type {
  AnyNewFact,
  DesignMode,
  InsertRow,
  ItemFields,
  ItemId,
  ItemKindName,
  ItemRow,
  ItemView,
  ItemWithLevers,
  LeverKind,
  LeverRow,
  NoteRow,
  RelationRow,
  StoreReader,
} from '@boxxy/model';
import { brandSchemas, heldLeverKind, releaseLeverKind, toAttemptSummary } from '@boxxy/model';
import { ORPCError } from '@orpc/server';
import type { ServerDeps } from '../types.ts';
import { api } from './api.ts';
import { buildAcceptance, buildCriterion, refuseUnknownTags } from './build-acceptance.ts';
import { buildOwnerFact } from './build-owner-fact.ts';
import { collectItemPage } from './collect-item-page.ts';
import { readItemIds } from './read-item-ids.ts';
import { resolveItemID } from './resolve-item-id.ts';
import { signoffItemHandler } from './signoff-item-handler.ts';
import { writeLevers } from './write-levers.ts';

const owner = 'boxxy:owner:local';

// the kind of an item filed with none; triage sets the real one
const untriagedKind = 'core.idea';

// The owner's commands and reads on one item. A command writes one store change with its facts,
// or nothing; a read writes nothing.
export const itemHandlers = {
  file: api.item.file.handler((options) => {
    const input = options.input;
    const notFound = options.errors.NOT_FOUND;
    const repoNotConfigured = options.errors.REPO_NOT_CONFIGURED;
    const deps = options.context.deps;
    const kind = parseKnownKind(deps, input.kind ?? untriagedKind);
    const repo = brandSchemas.repoName.safeParse(input.repo);

    if (kind === null || !repo.success) {
      throw new ORPCError('BAD_REQUEST', { message: 'unknown item kind or repository name' });
    }

    if (!deps.repos.has(repo.data)) {
      throw repoNotConfigured({ data: { repo: repo.data } });
    }

    const drafts = input.acceptance.map((entry) =>
      typeof entry === 'string' ? { text: entry } : entry,
    );

    refuseUnknownTags(
      deps,
      drafts.flatMap((draft) => draft.tags ?? []),
    );

    return deps.store.exclusive(async (tx) => {
      const now = deps.clock.now();

      const blockers = await readItemIds(tx, deps, input.blockedBy);

      if (blockers.kind === 'not-found') {
        throw notFound({ data: { item: blockers.item } });
      }

      const row: InsertRow<'items'> = {
        id: brandSchemas.itemId.parse(deps.newId()),
        kind,
        repo: repo.data,
        title: input.title,
        outcome: input.outcome,
        body: input.body,
        acceptance: drafts.map((draft, index) => buildCriterion(index + 1, draft)),
        fields: buildEditedFields({}, input) ?? {},
        labels: input.labels,
        foundInAttempt: null,
        filedBy: owner,
        filedAt: now,
        closedAt: null,
        closeReason: null,
        keptSession: null,
      };

      const { keptSession: _keptSession, ...filed } = row;
      const relations = blockers.items.map((source) => buildBlocksRow(source, row.id, now));
      const filedFact = buildOwnerFact(deps, row.id, 'boxxy.item.filed', filed);

      const held =
        input.held === undefined
          ? []
          : [buildOwnerLever(row.id, heldLeverKind, input.held.reason, now)];

      refuseLargeFact(filedFact, options.errors.FACT_TOO_LARGE);

      await tx.applyChange({
        at: now,
        writes: [
          { op: 'insert', table: 'items', row },
          ...held.map((lever) => ({ op: 'insert', table: 'levers', row: lever }) as const),
          ...relations.map(
            (relation) => ({ op: 'insert', table: 'relations', row: relation }) as const,
          ),
        ],
        facts: [
          filedFact,
          ...held.map((lever) => buildOwnerFact(deps, row.id, 'boxxy.lever.recorded', lever)),
          ...relations.map((relation) =>
            buildOwnerFact(deps, relation.source, 'boxxy.relation.added', {
              source: relation.source,
              target: relation.target,
              type: relation.type,
            }),
          ),
        ],
      });

      const ref = await tx.readItemRef(row.id);

      if (ref === null) {
        throw new Error('the filed item has no short reference');
      }

      return { item: row.id, ref };
    });
  }),
  edit: api.item.edit.handler((options) => {
    const input = options.input;
    const deps = options.context.deps;

    refuseUnknownTags(deps, input.acceptance?.flatMap((entry) => entry.tags ?? []) ?? []);

    return deps.store.exclusive(async (tx) => {
      const item = await readItemOrThrow(tx, deps, input.item, options.errors.NOT_FOUND);

      const acceptance =
        input.acceptance === undefined ? undefined : buildAcceptance(item, input.acceptance);

      if (acceptance === null) {
        throw new ORPCError('BAD_REQUEST', { message: 'an acceptance entry names no criterion' });
      }

      const fields = buildEditedFields(item.fields, input);

      const set = {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(acceptance === undefined ? {} : { acceptance }),
        ...(fields === null ? {} : { fields }),
        ...(input.labels === undefined ? {} : { labels: input.labels }),
      };

      const now = deps.clock.now();

      const editedFact = buildOwnerFact(deps, item.id, 'boxxy.item.edited', {
        ...set,
        byAttempt: null,
      });

      refuseLargeFact(editedFact, options.errors.FACT_TOO_LARGE);

      await tx.applyChange({
        at: now,
        writes: [{ op: 'update', table: 'items', key: { id: item.id }, expect: {}, set }],
        facts: [editedFact],
      });

      return { item: item.id };
    });
  }),
  close: api.item.close.handler((options) => {
    const input = options.input;
    const notFound = options.errors.NOT_FOUND;
    const deps = options.context.deps;

    return deps.store.exclusive(async (tx) => {
      const item = await readItemOrThrow(tx, deps, input.item, notFound);

      const of =
        input.of === undefined ? null : await readItemOrThrow(tx, deps, input.of, notFound);

      if (item.closedAt !== null) {
        return { item: item.id, ended: [] };
      }

      const now = deps.clock.now();
      const reason = of === null ? input.reason : 'duplicate';

      const ended = endItemAttempts({
        attempts: await tx.listItemAttempts(item.id),
        actor: owner,
        now,
        newId: deps.newId,
      });

      const live = of === null ? false : await probeLiveDuplicateOf(tx, deps, item.id, of.id);

      const relation =
        of === null || live ? null : buildRelationRow(item.id, of.id, 'duplicate-of', now);

      await tx.applyChange({
        at: now,
        under: ended.under,
        writes: [
          ...ended.writes,
          {
            op: 'update',
            table: 'items',
            key: { id: item.id },
            expect: { closedAt: null },
            set: { closedAt: now, closeReason: reason },
          },
          ...(relation === null
            ? []
            : [{ op: 'insert', table: 'relations', row: relation } as const]),
        ],
        facts: [
          ...ended.facts,
          buildOwnerFact(deps, item.id, 'boxxy.item.closed', {
            reason,
            byAttempt: null,
            ended: ended.ended,
          }),
          ...(relation === null
            ? []
            : [
                buildOwnerFact(deps, item.id, 'boxxy.relation.added', {
                  source: relation.source,
                  target: relation.target,
                  type: relation.type,
                }),
              ]),
        ],
      });

      return { item: item.id, ended: [...ended.ended] };
    });
  }),
  retry: api.item.retry.handler(async (options) => {
    const input = options.input;
    const notFound = options.errors.NOT_FOUND;
    const unknownPhase = options.errors.UNKNOWN_PHASE;
    const itemHeld = options.errors.ITEM_HELD;
    const deps = options.context.deps;
    const rules = deps.rulesState().rules;

    const item = await deps.store.read((tx) => readItemOrThrow(tx, deps, input.item, notFound));

    // A retry would move a held item's position, so its release would skip triage.
    if (item.derived.state === 'held') {
      throw itemHeld();
    }

    const phase =
      input.phase === undefined
        ? null
        : rules.kinds.get(item.kind)?.pipeline.steps.find((step) => step.phase === input.phase)
            ?.phase;

    if (phase === undefined) {
      throw unknownPhase();
    }

    const answer = await writeLevers(deps, [item.id], {
      kind: 'item.retry',
      until: null,
      expiresAt: null,
      reason: null,
      phase,
    });

    if (answer.kind === 'not-found') {
      throw notFound({ data: { item: answer.item } });
    }

    return { lever: answer.levers[0] ?? 0 };
  }),
  signoff: signoffItemHandler,
  wake: api.item.wake.handler(async (options) => {
    const deps = options.context.deps;

    const attempts = await deps.store.read(async (tx) => {
      const item = await readItemOrThrow(tx, deps, options.input.item, options.errors.NOT_FOUND);

      return tx.listItemAttempts(item.id);
    });

    const asleep = attempts.find((attempt) => attempt.state === 'sleeping');

    if (asleep === undefined) {
      return { kind: 'not-sleeping' } as const;
    }

    const result = await requestWake({
      store: deps.store,
      attempt: asleep.id,
      by: 'command',
      actor: owner,
      now: deps.clock.now(),
      newId: deps.newId,
    });

    return result.kind === 'applied'
      ? ({ kind: 'requested', attempt: asleep.id, atcSession: asleep.atcSession } as const)
      : ({ kind: 'not-sleeping' } as const);
  }),
  release: api.item.release.handler((options) => {
    const deps = options.context.deps;

    return deps.store.exclusive(async (tx) => {
      const item = await readItemOrThrow(tx, deps, options.input.item, options.errors.NOT_FOUND);

      if (item.derived.state !== 'held') {
        return { kind: 'refused', reason: 'not-held' } as const;
      }

      const now = deps.clock.now();
      const lever = buildOwnerLever(item.id, releaseLeverKind, null, now);

      await tx.applyChange({
        at: now,
        writes: [{ op: 'insert', table: 'levers', row: lever }],
        facts: [buildOwnerFact(deps, item.id, 'boxxy.lever.recorded', lever)],
      });

      return { kind: 'released', item: item.id } as const;
    });
  }),
  note: api.item.note.handler((options) => {
    const input = options.input;
    const deps = options.context.deps;

    return deps.store.exclusive(async (tx) => {
      const item = await readItemOrThrow(tx, deps, input.item, options.errors.NOT_FOUND);
      const notes = await tx.listItemNotes(item.id);

      const now = deps.clock.now();

      const note: NoteRow = {
        item: item.id,
        seq: Math.max(0, ...notes.map((entry) => entry.seq)) + 1,
        text: input.text,
        by: owner,
        at: now,
      };

      await tx.applyChange({
        at: now,
        writes: [{ op: 'insert', table: 'notes', row: note }],
        facts: [
          buildOwnerFact(deps, item.id, 'boxxy.item.noted', { seq: note.seq, text: note.text }),
        ],
      });

      return { item: item.id, seq: note.seq };
    });
  }),
  get: api.item.get.handler(async (options) => {
    const input = options.input;
    const notFound = options.errors.NOT_FOUND;
    const deps = options.context.deps;

    const detail = await deps.store.read(async (tx) => {
      const item = await resolveItemID(tx, input.item);

      return item === null
        ? null
        : tx.readItemDetail(item, deps.clock.now(), deps.rulesState().rules);
    });

    if (detail === null) {
      throw notFound({ data: { item: input.item } });
    }

    return {
      item: toItemView(detail.item),
      notes: [...detail.notes],
      attempts: detail.attempts.map(toAttemptSummary),
      relations: [...detail.relations],
      evidence: [...detail.evidence],
      pullRequests: [...detail.pullRequests],
      revisions: detail.revisions.map((revision) => ({
        seq: revision.seq,
        at: revision.at,
        actor: revision.actor,
        changed: [...revision.changed],
      })),
    };
  }),
  list: api.item.list.handler(async (options) => {
    const input = options.input;
    const deps = options.context.deps;
    const now = deps.clock.now();
    const repo = input.repo === undefined ? undefined : brandSchemas.repoName.safeParse(input.repo);

    if (repo?.success === false) {
      return { items: [], next: null };
    }

    const listed = await deps.store.read(async (tx) => {
      const items = await tx.listItems(
        {
          ...(input.state === undefined ? {} : { state: input.state }),
          ...(repo === undefined ? {} : { repo: repo.data }),
        },
        now,
        deps.rulesState().rules,
      );

      return Promise.all(
        items.map(async (item) => ({ item, notes: await tx.listItemNotes(item.id) })),
      );
    });

    return collectItemPage(listed, input);
  }),
};

function parseKnownKind(deps: ServerDeps, raw: string): ItemKindName | null {
  const kind = brandSchemas.itemKindName.safeParse(raw);

  return kind.success && deps.rulesState().rules.kinds.has(kind.data) ? kind.data : null;
}

interface FieldsInput {
  readonly designMode?: DesignMode | undefined;
  readonly security?: boolean | undefined;
}

// The item's fields after the owner's change, or null when the change names none. False clears
// the security mark, since the mark is stored only as true.
function buildEditedFields(fields: ItemFields, input: FieldsInput): ItemFields | null {
  if (input.designMode === undefined && input.security === undefined) {
    return null;
  }

  const { security: _security, ...rest } = fields;
  const security = input.security ?? fields.security === true;

  return {
    ...rest,
    ...(input.designMode === undefined ? {} : { designMode: input.designMode }),
    ...(security ? { security: true } : {}),
  };
}

function buildBlocksRow(source: ItemId, target: ItemId, at: ItemRow['filedAt']): RelationRow {
  return buildRelationRow(source, target, 'blocks', at);
}

function buildRelationRow(
  source: ItemId,
  target: ItemId,
  type: string,
  at: ItemRow['filedAt'],
): RelationRow {
  return {
    source,
    target,
    type: brandSchemas.relationTypeName.parse(type),
    addedBy: owner,
    addedAt: at,
    removedAt: null,
  };
}

// The store numbers the lever on insert.
function buildOwnerLever(
  item: ItemId,
  kind: LeverKind,
  reason: string | null,
  at: ItemRow['filedAt'],
): LeverRow {
  return {
    seq: 0,
    kind,
    item,
    until: null,
    expiresAt: null,
    reason,
    phase: null,
    head: null,
    actor: owner,
    at,
  };
}

interface FactTooLargeOptions {
  readonly data: { readonly bytes: number; readonly max: number };
}

type FactTooLarge = (options: FactTooLargeOptions) => Error;

// A fact over the outbox's limit would be parked and never reach the sink, so the door refuses
// the change that makes it.
function refuseLargeFact(fact: AnyNewFact, tooLarge: FactTooLarge): void {
  const bytes = measureNewFactBytes(fact);

  if (bytes > outboxLimits.factBytes) {
    throw tooLarge({ data: { bytes, max: outboxLimits.factBytes } });
  }
}

interface NotFoundOptions {
  readonly data: { readonly item: string };
}

type NotFound = (options: NotFoundOptions) => Error;

async function readItemOrThrow(
  tx: StoreReader,
  deps: ServerDeps,
  raw: string,
  notFound: NotFound,
): Promise<ItemView> {
  const id = await resolveItemID(tx, raw);

  const item =
    id === null ? null : await tx.readItem(id, deps.clock.now(), deps.rulesState().rules);

  if (item === null) {
    throw notFound({ data: { item: raw } });
  }

  return item;
}

// A close as a duplicate adds the duplicate-of relation unless it is live already: the store holds
// one live relation per source, target and type.
async function probeLiveDuplicateOf(
  tx: StoreReader,
  deps: ServerDeps,
  source: ItemId,
  target: ItemId,
): Promise<boolean> {
  const snapshot = await tx.readSnapshot(deps.clock.now(), deps.rulesState().rules);

  return snapshot.relations.some(
    (row) => row.source === source && row.target === target && row.type === 'duplicate-of',
  );
}

function toItemView(item: ItemWithLevers): ItemView {
  const { levers: _levers, ...view } = item;

  return view;
}
