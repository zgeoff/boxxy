import { contentHash } from '@boxxy/content-hash';
import type {
  ActorRef,
  AttemptId,
  AttemptRow,
  ClaimNextResult,
  ItemDetailRows,
  ItemId,
  ItemView,
  JsonValue,
  KeptPick,
  LimitCount,
  LimitName,
  LoadedRules,
  NoteRow,
  PhaseName,
  PickedClaim,
  PipelineStep,
  Recipe,
  SessionMode,
  SkipReason,
  SkippedClaim,
  Snapshot,
  SpawnRequest,
  StartPick,
  StoreTx,
  WakePick,
} from '@boxxy/model';
import { brandSchemas, collectRetries, toJSONValue } from '@boxxy/model';
import { buildFrame, decide } from '@boxxy/planning';
import { renderPromptTemplate } from '@boxxy/prompt-template';
import invariant from 'tiny-invariant';
import type { AttemptChange } from '../attempts/build-attempt-change.ts';
import { buildAttemptChange } from '../attempts/build-attempt-change.ts';
import { buildSkipChange } from '../attempts/build-skip-change.ts';
import type { ClaimedEvent, DecisionDraft } from '../attempts/types.ts';
import { isBuilderSession } from '../sessions/is-builder-session.ts';
import { buildPromptValues } from './build-prompt-values.ts';
import { buildRecipeHash } from './build-recipe-hash.ts';
import { buildSnapshotHash } from './build-snapshot-hash.ts';
import { filterTaggedCriteria } from './filter-tagged-criteria.ts';
import { findRecipeName } from './find-recipe-name.ts';
import { pickKeptSession } from './pick-kept-session.ts';
import { pickPromptPath } from './pick-prompt-path.ts';
import { readGateSkip } from './read-gate-skip.ts';
import type { ClaimInput, SpawnSettings } from './types.ts';

// A race that `decide` did not see: the change took no lease or no seat. The runner ends the
// tick's claim loop on it.
export class ClaimRaceError extends Error {
  constructor(result: string) {
    super(`the claim lost a race: ${result}`);

    this.name = 'ClaimRaceError';
  }
}

// Records each skip, then picks with `decide` and writes the first pick, all inside one store
// lock. A start pick takes the item-phase lease and its seats; a wake pick takes the sleeping
// attempt's seats. A skip takes neither, and writes no decision.
export function claimNext(input: ClaimInput): Promise<ClaimNextResult> {
  return input.store.exclusive(async (tx) => {
    const runner = await tx.readRunner(input.runner);

    if (runner?.paused === true) {
      return { skips: [], pick: null };
    }

    const claimed = input.claimed ?? new Set<ItemId>();
    const skips: SkippedClaim[] = [];

    // a skip moves its item on, so the next pass reads the item at its new step
    let pass = await writeSkipPass(tx, input, claimed);

    while (pass.length > 0) {
      skips.push(...pass);

      pass = await writeSkipPass(tx, input, claimed);
    }

    const pick = await writePick(tx, input, claimed);

    return { skips, pick };
  });
}

// Skips every ready item of a configured repo whose step has a gate that says skip. Each item
// skips at most once a pass.
async function writeSkipPass(
  tx: StoreTx,
  input: ClaimInput,
  claimed: ReadonlySet<ItemId>,
): Promise<SkippedClaim[]> {
  const snapshot = await tx.readSnapshot(input.now, input.rules);

  const skips: SkippedClaim[] = [];

  // an item with no acceptance lines reads as an idea, and no step takes it; a `criteria` gate
  // still says skip for it, because no line carries the tag
  for (const item of snapshot.items) {
    const candidate = pickSkipCandidate(item);

    if (candidate === null) {
      continue;
    }

    const step = input.rules.kinds
      .get(candidate.kind)
      ?.pipeline.steps.find((each) => each.phase === candidate.phase);

    if (
      step !== undefined &&
      hasGate(step) &&
      input.spawn.repos.has(candidate.repo) &&
      !claimed.has(candidate.id)
    ) {
      const detail = await tx.readItemDetail(candidate.id, input.now, input.rules);

      invariant(
        detail !== null,
        `the snapshot holds the item ${candidate.id}, which the store holds`,
      );

      const reason = await readGateSkip({
        step,
        item: candidate,
        pullRequests: detail.pullRequests,
        forge: input.forge ?? null,
      });

      if (reason !== null) {
        const skip = await writeSkip(tx, input, { detail, phase: candidate.phase, step, reason });

        skips.push(skip);
      }
    }
  }

  return skips;
}

function pickSkipCandidate(item: ItemView): (ItemView & { readonly phase: PhaseName }) | null {
  const position = item.position;

  if (position.kind !== 'phase' || !['ready', 'idea'].includes(item.derived.state)) {
    return null;
  }

  return { ...item, phase: position.phase };
}

function hasGate(step: PipelineStep): boolean {
  return step.criteria !== undefined || step.skipWhen !== undefined;
}

interface SkipParts {
  readonly detail: ItemDetailRows;
  readonly phase: PhaseName;
  readonly step: PipelineStep;
  readonly reason: SkipReason;
}

async function writeSkip(tx: StoreTx, input: ClaimInput, parts: SkipParts): Promise<SkippedClaim> {
  const item = parts.detail.item;
  const kind = input.rules.kinds.get(item.kind);
  const recipeName = kind === undefined ? undefined : findRecipeName(kind, parts.phase, 'agent');
  const material = recipeName === undefined ? undefined : input.rules.recipes.get(recipeName);

  invariant(material !== undefined, `the loader refuses a step with no recipe: ${parts.phase}`);
  invariant(item.position.kind === 'phase', `a ready item stands at a phase: ${item.id}`);

  const change = buildSkipChange({
    attempt: brandSchemas.attemptId.parse(input.newId()),
    fact: brandSchemas.factId.parse(input.newId()),
    actor: `boxxy:runner:${input.runner}`,
    runner: input.runner,
    now: input.now,
    item: item.id,
    phase: parts.phase,
    round: item.position.round,
    number: 1 + parts.detail.attempts.filter((row) => row.phase === parts.phase).length,
    reason: parts.reason,
    recipeHash: buildRecipeHash(material, input.rules),
    rulesVersion: input.rules.version,
  });

  const result = await tx.applyChange(change);

  if (result.kind !== 'applied') {
    throw new ClaimRaceError(result.kind);
  }

  return { kind: 'skipped', itemId: item.id, phase: parts.phase, reason: parts.reason };
}

async function writePick(
  tx: StoreTx,
  input: ClaimInput,
  claimed: ReadonlySet<ItemId>,
): Promise<ClaimNextResult['pick']> {
  const snapshot = await tx.readSnapshot(input.now, input.rules);

  const backoff = [...input.backoff.listHeld(input.now)];
  const frame = buildFrame({ snapshot, rules: input.rules, now: input.now });

  // a spawn needs the repo's checkout; an item of a repo the configuration does not name waits
  const candidates = frame.candidates.filter(
    (item) => input.spawn.repos.has(item.repo) && !claimed.has(item.id),
  );

  const wakes = snapshot.wakes.filter((wake) => !claimed.has(wake.item));

  const decision = decide({
    frame: { ...frame, candidates },
    pools: input.rules.pools,
    snapshot: { ...snapshot, wakes },
    backoff,
  });

  const [pick] = decision.picks;

  if (pick === undefined) {
    return null;
  }

  const draft = {
    rulesVersion: input.rules.version,
    snapshotHash: buildSnapshotHash(snapshot, backoff),
    storeVersion: snapshot.storeVersion,
    pepysOffsets: {},
    faults: frame.faults,
    limits: collectLimitCounts(snapshot, pick.limits),
  };

  return pick.kind === 'start'
    ? writeStartClaim(tx, input, pick, draft)
    : writeWakeClaim(tx, input, pick, draft);
}

function collectLimitCounts(snapshot: Snapshot, limits: readonly LimitName[]): LimitCount[] {
  return snapshot.limits
    .filter((limit) => limits.includes(limit.name))
    .map((limit) => ({ limit: limit.name, held: limit.held, max: limit.max }));
}

type SharedDraft = Omit<DecisionDraft, 'item' | 'kind' | 'pool'>;

async function writeStartClaim(
  tx: StoreTx,
  input: ClaimInput,
  pick: StartPick,
  draft: SharedDraft,
): Promise<PickedClaim> {
  const detail = await tx.readItemDetail(pick.item, input.now, input.rules);

  invariant(detail !== null, `decide picked the item ${pick.item}, which the store holds`);

  const event = buildClaimedEvent({
    pick,
    detail,
    rules: input.rules,
    settings: input.spawn,
    attempt: brandSchemas.attemptId.parse(input.newId()),
    leaseGen: (await tx.readLastLeaseGen(pick.item, pick.phase)) + 1,
    draft,
    runner: input.runner,
  });

  const built = buildAttemptChange({ ...buildBase(input), attempt: null, event: event.claimed });

  const attempt = await writeClaimChange(tx, built, event.claimed.attempt);

  return { kind: 'start', attempt, spawn: event.spawn, kept: event.kept };
}

interface ClaimedParts {
  readonly pick: StartPick;
  readonly detail: ItemDetailRows;
  readonly rules: LoadedRules;
  readonly settings: SpawnSettings;
  readonly attempt: AttemptId;
  readonly leaseGen: number;
  readonly draft: SharedDraft;
  readonly runner: ClaimInput['runner'];
}

// The new attempt's round, input, mode, recipe and spawn request. Pure.
function buildClaimedEvent(parts: ClaimedParts): {
  readonly claimed: ClaimedEvent;
  readonly spawn: SpawnRequest;
  readonly kept: KeptPick;
} {
  const phase = parts.rules.phases.get(parts.pick.phase);
  const kind = parts.rules.kinds.get(parts.detail.item.kind);

  invariant(phase !== undefined, `the rules load every phase of a pipeline: ${parts.pick.phase}`);

  invariant(
    kind !== undefined,
    `decide picks only an item of a loaded kind: ${parts.detail.item.kind}`,
  );

  // a step with a `criteria` gate sees only the lines it is tagged for, in its input and prompt
  const item = filterTaggedCriteria(
    parts.detail.item,
    kind.pipeline.steps.find((step) => step.phase === parts.pick.phase),
  );

  const mode: SessionMode = phase.mode?.(item) ?? 'agent';
  const recipeName = findRecipeName(kind, parts.pick.phase, mode);
  const material = recipeName === undefined ? undefined : parts.rules.recipes.get(recipeName);

  invariant(
    material !== undefined,
    `the loader refuses a step with no recipe: ${parts.pick.phase}`,
  );

  const phaseInput = phase.input({
    item,
    attempt: parts.attempt,
    history: parts.detail.attempts,
    retries: collectRetries(item.levers),
    pullRequests: parts.detail.pullRequests,
    session: material.recipe.session ?? null,
  });

  const spawn = buildSpawnRequest({
    item,
    notes: parts.detail.notes,
    attempt: parts.attempt,
    recipe: material.recipe,
    promptPath: pickPromptPath(material.recipe, parts.detail.attempts, parts.pick.phase),
    input: phaseInput,
    settings: parts.settings,
    phase: parts.pick.phase,
  });

  const kept = pickKeptSession({
    item,
    attempts: parts.detail.attempts,
    pipeline: kind.pipeline,
    phase: parts.pick.phase,
    isBuilderSession: isBuilderSession(parts.rules, kind, parts.pick.phase, mode),
  });

  return {
    spawn,
    kept,
    claimed: {
      kind: 'claimed',
      attempt: parts.attempt,
      pick: parts.pick,
      number: 1 + parts.detail.attempts.filter((row) => row.phase === parts.pick.phase).length,
      runner: parts.runner,
      leaseGen: parts.leaseGen,
      recipe: {
        hash: buildRecipeHash(material, parts.rules),
        rulesVersion: parts.rules.version,
      },
      skillsRef: parts.rules.skills?.ref ?? null,
      spawnRequest: toJSONValue(spawn),
      spawnRequestHash: contentHash(toJSONValue(spawn)),
      input: phaseInput,
      mode,
      worker: phase.worker,

      // the resumed session makes its first call before the worker answers the resume
      caller: kept.kind === 'kept' ? kept.session.caller : null,
      decision: { ...parts.draft, item: item.id, kind: 'start', pool: parts.pick.pool },
    },
  };
}

interface SpawnParts {
  readonly item: ItemView;
  readonly notes: readonly NoteRow[];
  readonly attempt: AttemptId;
  readonly recipe: Recipe;
  readonly promptPath: string;
  readonly input: JsonValue;
  readonly settings: SpawnSettings;
  readonly phase: string;
}

function buildSpawnRequest(parts: SpawnParts): SpawnRequest {
  const checkout = parts.settings.repos.get(parts.item.repo);
  const template = parts.settings.prompts.get(parts.promptPath);

  invariant(checkout !== undefined, `the configuration names no repo ${parts.item.repo}`);
  invariant(template !== undefined, `the rules checkout has no prompt ${parts.promptPath}`);

  return {
    target: parts.settings.target,
    ...(typeof checkout === 'string' ? { cwd: checkout } : { source: checkout }),
    prompt: renderPromptTemplate(
      template,
      buildPromptValues({
        item: parts.item,
        notes: parts.notes,
        input: parts.input,
        attempt: parts.attempt,
      }),
    ),
    agent: parts.recipe.agent,
    model: parts.recipe.model,
    effort: parts.recipe.effort,
    name: `boxxy/${parts.attempt}`,
    idempotencyKey: parts.attempt,
    repo: parts.item.repo,
    phase: parts.phase,
  };
}

function buildBase(input: ClaimInput) {
  const actor: ActorRef = `boxxy:runner:${input.runner}`;

  return { actor, now: input.now, newId: input.newId };
}

async function writeClaimChange(
  tx: StoreTx,
  built: AttemptChange,
  id: AttemptId,
): Promise<AttemptRow> {
  invariant(built.kind === 'change', `the attempt machine refused the claim of ${id}`);

  const result = await tx.applyChange(built.change);

  if (result.kind !== 'applied') {
    throw new ClaimRaceError(result.kind);
  }

  const row = await tx.readAttempt(id);

  invariant(row !== null, 'the claim wrote the attempt');

  return row;
}

async function writeWakeClaim(
  tx: StoreTx,
  input: ClaimInput,
  pick: WakePick,
  draft: SharedDraft,
): Promise<PickedClaim> {
  const attempt = await tx.readAttempt(pick.attempt);

  invariant(attempt !== null, `decide picked the wake of ${pick.attempt}, which the store holds`);
  invariant(attempt.pool !== null, `a sleeping attempt was picked into a pool: ${attempt.id}`);

  const pool = attempt.pool;

  const built = buildAttemptChange({
    ...buildBase(input),
    attempt,
    event: {
      kind: 'woken',
      pick,
      decision: { ...draft, item: attempt.item, kind: 'wake', pool },
      overCap: false,
    },
  });

  return { kind: 'wake', attempt: await writeClaimChange(tx, built, attempt.id) };
}
