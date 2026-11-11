import type { TreeFile } from '@boxxy/content-hash';
import { contentHash, hashBytes, hashTree } from '@boxxy/content-hash';
import type {
  Concept,
  ConceptName,
  ConceptPin,
  ItemKindName,
  KindRules,
  Limit,
  LoadRejection,
  LoadResult,
  PhaseKind,
  PhaseName,
  Pipeline,
  PipelineStep,
  Pool,
  RecipeMaterial,
  RecipeName,
  RelationType,
  RelationTypeName,
  RulesVersion,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { rulesFileName } from '../constants.ts';
import { parseConceptEntry } from '../parse/parse-concept-entry.ts';
import { parseRulesFile } from '../parse/parse-rules-file.ts';
import type { ParsedRulesFile, ParsedStep } from '../parse/rules-file-schema.ts';
import { buildRegistry } from '../registry/build-registry.ts';
import { resolvePlugin } from '../registry/resolve-plugin.ts';
import { resolveSignalRef } from '../registry/resolve-signal-ref.ts';
import type { Checked, PinnedConcept, ResolvedSignal } from '../types.ts';
import { buildRejection } from './build-rejection.ts';
import { collectFilterRejections } from './collect-filter-rejections.ts';
import { collectRecipeRejections } from './collect-recipe-rejections.ts';
import { collectStepRejections } from './collect-step-rejections.ts';
import { toFilter } from './to-filter.ts';

interface LoadRulesInput {
  readonly checkout: {
    readonly commit: string;
    readonly files: ReadonlyMap<string, Uint8Array>;
  };
  readonly concepts: readonly Concept[];
  readonly pins: ReadonlyMap<ConceptName, ConceptPin>;

  // the phase kinds the server registers, as it registers the concepts
  readonly phases: readonly PhaseKind[];
}

export function loadRules(input: LoadRulesInput): LoadResult {
  const rulesBytes = input.checkout.files.get(rulesFileName);

  if (rulesBytes === undefined) {
    return {
      kind: 'rejected',
      rejections: [
        buildRejection([], { kind: 'invalid', message: `the checkout has no ${rulesFileName}` }),
      ],
    };
  }

  return match(parseRulesFile(rulesFileName, rulesBytes))
    .with({ kind: 'rejected' }, (rejected): LoadResult => rejected)
    .with({ kind: 'parsed' }, (parsed) => buildLoadResult(parsed.file, rulesBytes, input))
    .exhaustive();
}

function buildLoadResult(
  file: ParsedRulesFile,
  rulesBytes: Uint8Array,
  input: LoadRulesInput,
): LoadResult {
  const pinned = collectPinnedConcepts(file, input.concepts);

  const built = buildRegistry(
    pinned.value,
    pinned.value.map((entry) => getPin(input.pins, entry.concept)),
  );

  const registry = built.value;
  const phases = buildPhases(input.phases);
  const lead = file.lead.map((ref, index) => resolveSignalRef(ref, ['lead', index], registry));

  const pools = file.pools.map((pool, poolIndex) => ({
    pool,
    order: pool.order.map((ref, index) =>
      resolveSignalRef(ref, ['pools', poolIndex, 'order', index], registry),
    ),
  }));

  const propagation = file.propagation.map((line, index) =>
    resolveSignalRef(line.value, ['propagation', index, 'value'], registry),
  );

  const gates = pinned.value.flatMap((entry) =>
    (entry.concept.gates ?? []).map((gate) =>
      resolvePlugin(gate, {}, gate.name, ['concepts', entry.entryIndex]),
    ),
  );

  const prompts = collectPrompts(file, input.checkout.files);
  const signals = [...lead, ...pools.flatMap((pool) => pool.order), ...propagation];

  const rejections = [
    ...pinned.rejections,
    ...built.rejections,
    ...[...signals, ...gates].flatMap((checked) => checked.rejections),
    ...collectPropagationRejections(file, propagation),
    ...collectStepRejections(file, phases),
    ...collectRecipeRejections(file),
    ...collectFilterRejections(file, registry),
    ...collectSleepRejections(file),
    ...prompts.rejections,
  ];

  if (rejections.length > 0) {
    return { kind: 'rejected', rejections };
  }

  const version = buildRulesVersion({
    commit: input.checkout.commit,
    files: [
      { path: rulesFileName, bytes: rulesBytes, executable: false },
      ...prompts.value.map((prompt) => ({
        path: prompt.recipe.prompt,
        bytes: prompt.bytes,
        executable: false,
      })),
    ],
    pins: registry.pins,
    phases: input.phases,
  });

  const leadKeys = lead.map((checked) => getValue(checked).key);

  return {
    kind: 'loaded',
    rules: {
      version,
      commit: input.checkout.commit,
      registry,
      signals: new Map(
        signals.map((checked) => [getValue(checked).key, getValue(checked).resolved]),
      ),
      gates: gates.map((checked) => getValue(checked)),
      kinds: buildKinds(file),
      phases,
      limits: file.limits.map((limit): Limit => ({
        name: limit.name,
        max: limit.max,
        counts: toFilter(limit.counts),
      })),
      pools: pools.map((entry): Pool => ({
        name: entry.pool.name,
        takes: toFilter(entry.pool.takes),
        order: [...new Set([...leadKeys, ...entry.order.map((checked) => getValue(checked).key)])],
      })),
      propagation: file.propagation,
      recipes: new Map(
        prompts.value.map((prompt): [RecipeName, RecipeMaterial] => [
          prompt.name,
          {
            name: prompt.name,
            recipe: prompt.recipe,
            promptHash: hashBytes(prompt.bytes),
            rulesVersion: version,
          },
        ]),
      ),
      sleep: file.sleep,
      skills: file.skills ?? null,
      relationTypes: new Map(
        file.relationTypes.map((name): [RelationTypeName, RelationType] => [name, { name }]),
      ),
    },
    warnings: [],
  };
}

function collectPinnedConcepts(
  file: ParsedRulesFile,
  concepts: readonly Concept[],
): { readonly value: readonly PinnedConcept[]; readonly rejections: readonly LoadRejection[] } {
  const pinned: PinnedConcept[] = [];
  const rejections: LoadRejection[] = [];

  for (const [entryIndex, entry] of file.concepts.entries()) {
    const ref = parseConceptEntry(entry);

    const concept = concepts.find(
      (candidate) => candidate.name === ref.name && candidate.version === ref.version,
    );

    if (concept === undefined) {
      rejections.push(
        buildRejection(['concepts', entryIndex], { kind: 'unknown-concept', ref: entry }),
      );
    } else {
      pinned.push({ concept, entryIndex });
    }
  }

  return { value: pinned, rejections };
}

function getPin(pins: ReadonlyMap<ConceptName, ConceptPin>, concept: Concept): ConceptPin {
  const ref = `${concept.name}@${concept.version}` as const;
  const pin = pins.get(concept.name);

  invariant(pin?.ref === ref, `the server passes a pin for each concept, and has none for ${ref}`);

  return pin;
}

function buildPhases(phases: readonly PhaseKind[]): ReadonlyMap<PhaseName, PhaseKind> {
  const byName = new Map(phases.map((phase) => [phase.name, phase]));

  invariant(byName.size === phases.length, 'the server registers each phase kind once');

  return byName;
}

interface RecipePrompt {
  readonly name: RecipeName;
  readonly recipe: ParsedRulesFile['recipes'][RecipeName];
  readonly bytes: Uint8Array;
}

function collectPrompts(
  file: ParsedRulesFile,
  files: ReadonlyMap<string, Uint8Array>,
): { readonly value: readonly RecipePrompt[]; readonly rejections: readonly LoadRejection[] } {
  const prompts: RecipePrompt[] = [];
  const rejections: LoadRejection[] = [];

  for (const [name, recipe] of Object.entries(file.recipes)) {
    const bytes = files.get(recipe.prompt);

    if (bytes === undefined) {
      rejections.push(
        buildRejection(['recipes', name, 'prompt'], {
          kind: 'missing-prompt',
          path: recipe.prompt,
        }),
      );
    } else {
      prompts.push({ name: brandSchemas.recipeName.parse(name), recipe, bytes });
    }
  }

  return { value: prompts, rejections };
}

function collectPropagationRejections(
  file: ParsedRulesFile,
  signals: readonly Checked<ResolvedSignal>[],
): LoadRejection[] {
  const relationTypes: ReadonlySet<string> = new Set(file.relationTypes);

  return file.propagation.flatMap((line, index) => {
    const rejections: LoadRejection[] = [];
    const signal = signals[index]?.value ?? null;

    if (!relationTypes.has(line.over)) {
      rejections.push(
        buildRejection(['propagation', index, 'over'], {
          kind: 'unknown-relation-type',
          relation: line.over,
        }),
      );
    }

    if (signal !== null && !signal.resolved.open((plugin) => plugin.combine !== undefined)) {
      rejections.push(
        buildRejection(['propagation', index, 'value'], {
          kind: 'signal-without-combine',
          signal: line.value,
        }),
      );
    }

    return rejections;
  });
}

function collectSleepRejections(file: ParsedRulesFile): LoadRejection[] {
  const sleep = file.sleep;

  return [
    ...(sleep.afterQuietMinutes < sleep.afterIdleMinutes
      ? [buildRejection(['sleep', 'afterQuietMinutes'], { kind: 'quiet-below-idle' })]
      : []),
    ...(sleep.afterUnattendedMinutes < sleep.afterQuietMinutes
      ? [buildRejection(['sleep', 'afterUnattendedMinutes'], { kind: 'unattended-below-quiet' })]
      : []),
  ];
}

interface RulesVersionInput {
  readonly commit: string;
  readonly files: readonly TreeFile[];
  readonly pins: readonly ConceptPin[];
  readonly phases: readonly PhaseKind[];
}

// A replay needs the exact plug-in code, so each concept pin and each phase kind's version are
// part of the version.
function buildRulesVersion(input: RulesVersionInput): RulesVersion {
  return brandSchemas.rulesVersion.parse(
    contentHash({
      commit: input.commit,
      files: hashTree(input.files),
      pins: input.pins.map((pin) => ({ ref: pin.ref, sourceHash: pin.sourceHash })),
      phases: input.phases.map((phase) => `${phase.name}@${phase.version}`).toSorted(),
    }),
  );
}

function getValue<T>(checked: Checked<T>): T {
  invariant(checked.value !== null, 'the loader builds rules only when every check passed');

  return checked.value;
}

function buildKinds(file: ParsedRulesFile): ReadonlyMap<ItemKindName, KindRules> {
  const pipelines = new Map(
    Object.entries(file.pipelines).map(([name, steps]): [string, Pipeline] => [
      name,
      { name: brandSchemas.pipelineName.parse(name), steps: steps.map((step) => buildStep(step)) },
    ]),
  );

  return new Map(
    Object.entries(file.kinds).map(([name, kind]): [ItemKindName, KindRules] => {
      const pipeline = pipelines.get(kind.pipeline);

      invariant(
        pipeline,
        `the rules file schema refuses the kind ${name}, whose pipeline is missing`,
      );

      return [brandSchemas.itemKindName.parse(name), { pipeline, recipes: kind.recipes }];
    }),
  );
}

function buildStep(step: ParsedStep): PipelineStep {
  invariant(step.timeoutMinutes !== undefined, 'the loader refuses a step with no time limit');

  return {
    phase: step.phase,
    maxAttempts: step.maxAttempts,
    timeoutMinutes: step.timeoutMinutes,
    on: step.on,
  };
}
