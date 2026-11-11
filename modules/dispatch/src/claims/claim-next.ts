import { contentHash } from '@boxxy/content-hash';
import type {
  ActorRef,
  AttemptId,
  AttemptRow,
  Claim,
  ItemDetailRows,
  ItemView,
  JsonValue,
  KeptSession,
  LimitCount,
  LimitName,
  LoadedRules,
  Recipe,
  RecipeMaterial,
  SessionMode,
  Snapshot,
  SpawnRequest,
  StartPick,
  StoreTx,
  WakePick,
} from '@boxxy/model';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import { buildFrame, decide } from '@boxxy/planning';
import invariant from 'tiny-invariant';
import type { AttemptChange } from '../attempts/build-attempt-change.ts';
import { buildAttemptChange } from '../attempts/build-attempt-change.ts';
import type { ClaimedEvent, DecisionDraft } from '../attempts/types.ts';
import { buildSnapshotHash } from './build-snapshot-hash.ts';
import { pickKeptSession } from './pick-kept-session.ts';
import type { ClaimInput, SpawnSettings } from './types.ts';

// A race that `decide` did not see: the change took no lease or no seat. The runner ends the
// tick's claim loop on it.
export class ClaimRaceError extends Error {
  constructor(result: string) {
    super(`the claim lost a race: ${result}`);

    this.name = 'ClaimRaceError';
  }
}

// Picks with `decide` and writes the first pick, all inside one store lock. A start pick takes
// the item-phase lease and its seats; a wake pick takes the sleeping attempt's seats.
export function claimNext(input: ClaimInput): Promise<Claim | null> {
  return input.store.exclusive(async (tx) => {
    const runner = await tx.readRunner(input.runner);

    if (runner?.paused === true) {
      return null;
    }

    const snapshot = await tx.readSnapshot(input.now, input.rules);

    const backoff = [...input.backoff.listHeld(input.now)];
    const frame = buildFrame({ snapshot, rules: input.rules, now: input.now });
    const decision = decide({ frame, pools: input.rules.pools, snapshot, backoff });
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
  });
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
): Promise<Claim> {
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
  readonly kept: KeptSession | null;
} {
  const item = parts.detail.item;
  const phase = parts.rules.phases.get(parts.pick.phase);
  const kind = parts.rules.kinds.get(item.kind);

  invariant(phase !== undefined, `the rules load every phase of a pipeline: ${parts.pick.phase}`);
  invariant(kind !== undefined, `decide picks only an item of a loaded kind: ${item.kind}`);

  const mode: SessionMode = phase.mode?.(item) ?? 'agent';

  const recipeName =
    (mode === 'attended' ? kind.recipes[`${parts.pick.phase}/attended`] : undefined) ??
    kind.recipes[parts.pick.phase];

  const material = recipeName === undefined ? undefined : parts.rules.recipes.get(recipeName);

  invariant(
    material !== undefined,
    `the loader refuses a step with no recipe: ${parts.pick.phase}`,
  );

  const phaseInput = phase.input({
    item,
    history: parts.detail.attempts,
    pullRequests: parts.detail.pullRequests,
  });

  const spawn = buildSpawnRequest({
    item,
    attempt: parts.attempt,
    recipe: material.recipe,
    input: phaseInput,
    settings: parts.settings,
  });

  const kept = pickKeptSession({
    item,
    attempts: parts.detail.attempts,
    pipeline: kind.pipeline,
    phase: parts.pick.phase,
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

      // the resumed session makes its first call before the worker answers the resume
      caller: kept?.caller ?? null,
      decision: { ...parts.draft, item: item.id, kind: 'start', pool: parts.pick.pool },
    },
  };
}

interface SpawnParts {
  readonly item: ItemView;
  readonly attempt: AttemptId;
  readonly recipe: Recipe;
  readonly input: JsonValue;
  readonly settings: SpawnSettings;
}

function buildSpawnRequest(parts: SpawnParts): SpawnRequest {
  const cwd = parts.settings.repoPaths.get(parts.item.repo);
  const template = parts.settings.prompts.get(parts.recipe.prompt);

  invariant(cwd !== undefined, `the configuration names no path for the repo ${parts.item.repo}`);
  invariant(template !== undefined, `the rules checkout has no prompt ${parts.recipe.prompt}`);

  return {
    target: parts.settings.target,
    cwd,
    prompt: renderPrompt(template, {
      title: parts.item.title,
      outcome: parts.item.outcome,
      repo: parts.item.repo,
      attempt_id: parts.attempt,
      acceptance: parts.item.acceptance
        .map((criterion) => `- ${criterion.id}: ${criterion.text}`)
        .join('\n'),
      input: JSON.stringify(parts.input, null, 2),
    }),
    agent: parts.recipe.agent,
    model: parts.recipe.model,
    effort: parts.recipe.effort,
    name: `boxxy/${parts.attempt}`,
    idempotencyKey: parts.attempt,
  };
}

// Each `{{name}}` with a value is replaced; any other text stays as it is.
function renderPrompt(template: string, values: Readonly<Record<string, string>>): string {
  return template.replaceAll(
    /\{\{(?<name>[a-z_]+)\}\}/gu,
    (whole, name: string) => values[name] ?? whole,
  );
}

// The recipe hash covers the recipe's fields, its prompt, the rules version and the skills pin.
function buildRecipeHash(material: RecipeMaterial, rules: LoadedRules) {
  const hash = contentHash(
    toJSONValue({
      recipe: material.recipe,
      promptHash: material.promptHash,
      rulesVersion: material.rulesVersion,
      skills: rules.skills,
    }),
  );

  return brandSchemas.recipeHash.parse(hash);
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
): Promise<Claim> {
  const attempt = await tx.readAttempt(pick.attempt);

  invariant(attempt !== null, `decide picked the wake of ${pick.attempt}, which the store holds`);

  const built = buildAttemptChange({
    ...buildBase(input),
    attempt,
    event: {
      kind: 'woken',
      pick,
      decision: { ...draft, item: attempt.item, kind: 'wake', pool: attempt.pool },
      overCap: false,
    },
  });

  return { kind: 'wake', attempt: await writeClaimChange(tx, built, attempt.id) };
}
