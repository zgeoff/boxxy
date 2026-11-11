import type { TreeFile } from '@boxxy/content-hash';
import { contentHash, hashBytes, hashTree } from '@boxxy/content-hash';
import type {
  Concept,
  ConceptName,
  ConceptPin,
  ItemKindName,
  SliceOneKindRules as KindRules,
  LoadRejection,
  SliceOneLoadResult as LoadResult,
  LoadedRecipe,
  SliceOnePool as Pool,
  RecipeName,
  RulesVersion,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { rulesFileName } from '../constants.ts';
import { parseConceptEntry } from '../parse/parse-concept-entry.ts';
import { parseRulesFile } from '../parse/parse-rules-file.ts';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRegistry } from '../registry/build-registry.ts';
import { resolvePlugin } from '../registry/resolve-plugin.ts';
import { resolveSignalRef } from '../registry/resolve-signal-ref.ts';
import type { Checked, PinnedConcept, ResolvedSignal } from '../types.ts';
import { buildRejection } from './build-rejection.ts';

interface LoadRulesInput {
  readonly checkout: {
    readonly commit: string;
    readonly files: ReadonlyMap<string, Uint8Array>;
  };
  readonly concepts: readonly Concept[];
  readonly pins: ReadonlyMap<ConceptName, ConceptPin>;
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
    ...collectMissingRecipes(file),
    ...prompts.rejections,
  ];

  if (rejections.length > 0) {
    return { kind: 'rejected', rejections };
  }

  const version = buildRulesVersion(
    input.checkout.commit,
    [
      { path: rulesFileName, bytes: rulesBytes, executable: false },
      ...prompts.value.map((prompt) => ({
        path: prompt.recipe.prompt,
        bytes: prompt.bytes,
        executable: false,
      })),
    ],
    registry.pins,
  );

  const leadKeys = lead.map((checked) => getValue(checked).key);
  const kinds = buildKinds(file);

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
      kinds,
      maxAttemptsByKind: new Map(
        [...kinds].map(([kind, kindRules]) => [
          kind,
          new Map(kindRules.pipeline.steps.map((step) => [step.phase, step.maxAttempts])),
        ]),
      ),
      pools: pools.map((entry): Pool => ({
        name: entry.pool.name,
        slots: entry.pool.slots,
        takes: buildTakes(entry.pool.takes),
        order: [...new Set([...leadKeys, ...entry.order.map((checked) => getValue(checked).key)])],
      })),
      propagation: file.propagation,
      recipes: new Map(
        prompts.value.map((prompt): [RecipeName, LoadedRecipe] => [
          prompt.name,
          {
            name: prompt.name,
            recipe: { ...prompt.recipe, skills: [] },
            promptHash: hashBytes(prompt.bytes),
            rulesVersion: version,
          },
        ]),
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

const knownRelationTypes: ReadonlySet<string> = new Set(['blocks']);

function collectPropagationRejections(
  file: ParsedRulesFile,
  signals: readonly Checked<ResolvedSignal>[],
): LoadRejection[] {
  return file.propagation.flatMap((line, index) => {
    const rejections: LoadRejection[] = [];
    const signal = signals[index]?.value ?? null;

    if (!knownRelationTypes.has(line.over)) {
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

function collectMissingRecipes(file: ParsedRulesFile): LoadRejection[] {
  return Object.entries(file.kinds).flatMap(([itemKind, kind]) =>
    kind.pipeline
      .filter(
        (phase) =>
          !Object.hasOwn(kind.recipes, phase) ||
          !Object.hasOwn(file.recipes, kind.recipes[phase] ?? ''),
      )
      .map((phase) =>
        buildRejection(['kinds', itemKind, 'recipes', phase], {
          kind: 'missing-recipe',
          itemKind,
          phase,
        }),
      ),
  );
}

function buildRulesVersion(
  commit: string,
  files: readonly TreeFile[],
  pins: readonly ConceptPin[],
): RulesVersion {
  return brandSchemas.rulesVersion.parse(
    contentHash({
      commit,
      files: hashTree(files),
      pins: pins.map((pin) => ({ ref: pin.ref, sourceHash: pin.sourceHash })),
    }),
  );
}

function getValue<T>(checked: Checked<T>): T {
  invariant(checked.value !== null, 'the loader builds rules only when every check passed');

  return checked.value;
}

function buildKinds(file: ParsedRulesFile): ReadonlyMap<ItemKindName, KindRules> {
  return new Map(
    Object.entries(file.kinds).map(([name, kind]): [ItemKindName, KindRules] => [
      brandSchemas.itemKindName.parse(name),
      {
        pipeline: {
          name: brandSchemas.pipelineName.parse(name),
          steps: kind.steps,
        },
        recipes: kind.recipes,
      },
    ]),
  );
}

function buildTakes(
  takes: ParsedRulesFile['pools'][number]['takes'],
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    Object.entries(takes).map(([field, value]) => [
      field,
      typeof value === 'string' ? [value] : value,
    ]),
  );
}
