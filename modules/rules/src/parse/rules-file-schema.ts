import type { Effort } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { z } from 'zod';
import { parseConceptEntry } from './parse-concept-entry.ts';

const nameSchema = z.string().min(1);

const pluginRefSchema = z.union([
  nameSchema,
  z.record(nameSchema, z.json()).refine((ref) => Object.keys(ref).length === 1, {
    message: 'a plug-in reference with parameters is a map with one key, the plug-in name',
  }),
]);

const edgeSchema = z.union([
  z.literal('next'),
  z.literal('again'),
  z.strictObject({
    to: brandSchemas.phaseName,
    max: z.int().positive().exactOptional(),
    resume: z.boolean().exactOptional(),
  }),
  z.strictObject({ end: nameSchema }),
  z.strictObject({ hold: brandSchemas.rulesHoldReason }),
]);

// never `again` or `{ to }`: a skipped step must not run, and the edge must leave it
const skipEdgeSchema = z.union([
  z.literal('next'),
  z.strictObject({ end: nameSchema }),
  z.strictObject({ hold: brandSchemas.rulesHoldReason }),
]);

// A condition is a map with one key, the condition name. The loader refuses a name it does not
// read, by its own reason.
const skipConditionSchema = z
  .record(nameSchema, z.json())
  .refine((condition) => Object.keys(condition).length === 1, {
    message: 'a skip condition is a map with one key, the condition name',
  });

// `timeoutMinutes` is optional here so that the loader refuses a step without it by its own reason
const stepSchema = z.strictObject({
  phase: brandSchemas.phaseName,
  maxAttempts: z.int().positive(),
  timeoutMinutes: z.int().positive().optional(),
  on: z.record(nameSchema, edgeSchema),
  criteria: z.strictObject({ tagged: nameSchema }).exactOptional(),
  skipWhen: z.array(skipConditionSchema).exactOptional(),
  waits: z.array(nameSchema).min(1).exactOptional(),
  skip: skipEdgeSchema.exactOptional(),
});

const deployTagSchema = z.strictObject({ tag: nameSchema });
const releaseSchema = z.strictObject({ prerelease: z.boolean().exactOptional() });
const deploySchema = z.strictObject({ repo: brandSchemas.repoName, tag: nameSchema });

// how a repo's merged code ships; a repo with no entry ships `none`
const shipRuleSchema = z.union([
  z.literal('none'),
  z.strictObject({ 'deploy-tag': deployTagSchema }),
  z.strictObject({
    release: releaseSchema,
    // oxlint-disable-next-line unicorn/no-thenable -- `then` is the rules file's key for the deploy step of a release
    then: deploySchema.exactOptional(),
  }),
]);

const repoSchema = z.strictObject({ ships: shipRuleSchema.default('none') });

const kindSchema = z.strictObject({
  pipeline: brandSchemas.pipelineName,

  // by phase, and by `<phase>/attended` for an attended session of the phase
  recipes: z.record(nameSchema, brandSchemas.recipeName),
});

const filterSchema = z.record(nameSchema, z.union([nameSchema, z.array(nameSchema).min(1)]));

const limitSchema = z.strictObject({
  name: brandSchemas.limitName,
  max: z.int().positive(),
  counts: filterSchema,
});

const poolSchema = z.strictObject({
  name: brandSchemas.poolName,
  slots: z.never({ error: 'a pool has no slot count; a limit caps its attempts' }).optional(),
  takes: filterSchema,
  order: z.array(pluginRefSchema),
});

const efforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const satisfies readonly Effort[];

const promptPathSchema = nameSchema.refine(isCheckoutPath, {
  message: 'a prompt path runs from the checkout root, with no empty, "." or ".." folder',
});

const recipeSchema = z.strictObject({
  agent: nameSchema,
  model: nameSchema,
  effort: z.enum(efforts),
  prompt: promptPathSchema,
  reworkPrompt: promptPathSchema.exactOptional(),
  source: brandSchemas.sourceName,
  skills: z.array(nameSchema),

  // no default: the recipe hash covers the whole recipe, and a default would move every hash
  session: z.enum(['builder', 'fresh']).exactOptional(),
});

// `checks` may be empty here so that the loader refuses an empty list by its own reason
const mergeRulesSchema = z.strictObject({
  method: z.enum(['merge', 'squash', 'rebase']),
  checks: z.array(nameSchema),
});

const skillsPinSchema = z.strictObject({
  source: brandSchemas.repoName,
  ref: brandSchemas.commitSha,
});

const conceptEntrySchema = z.templateLiteral([nameSchema, '@', z.int().positive()]);

const propagationLineSchema = z.strictObject({
  value: nameSchema,
  over: brandSchemas.relationTypeName,
  toward: z.enum(['source', 'target']),
});

const minutesSchema = z.int().positive();

export const rulesFileSchema = z
  .strictObject({
    version: z.literal(1),
    concepts: z.array(conceptEntrySchema),
    criterionTags: z.array(nameSchema).default([]),
    repos: z.record(brandSchemas.repoName, repoSchema).default({}),
    pipelines: z.record(brandSchemas.pipelineName, z.array(stepSchema).min(1)),
    kinds: z.record(brandSchemas.itemKindName, kindSchema),
    skills: skillsPinSchema.optional(),
    relationTypes: z.array(brandSchemas.relationTypeName),
    recipes: z.record(brandSchemas.recipeName, recipeSchema),
    merge: mergeRulesSchema.optional(),
    limits: z.array(limitSchema),
    pools: z.array(poolSchema),
    lead: z.array(pluginRefSchema).default([]),
    propagation: z.array(propagationLineSchema).default([]),
    sleep: z.strictObject({
      afterIdleMinutes: minutesSchema,
      afterQuietMinutes: minutesSchema,
      afterUnattendedMinutes: minutesSchema,
      afterSilentMinutes: minutesSchema.default(45),
    }),
  })
  .superRefine((file, ctx) => {
    for (const issue of [
      ...collectRepeats(
        file.concepts.map((entry) => parseConceptEntry(entry).name),
        ['concepts'],
        [],
        (name) => `the concept ${name} is pinned twice`,
      ),
      ...collectRepeats(
        file.pools.map((pool) => pool.name),
        ['pools'],
        ['name'],
        (name) => `the pool name ${name} is used twice`,
      ),
      ...collectRepeats(
        file.limits.map((limit) => limit.name),
        ['limits'],
        ['name'],
        (name) => `the limit name ${name} is used twice`,
      ),
      ...collectRepeats(
        file.criterionTags,
        ['criterionTags'],
        [],
        (name) => `the criterion tag ${name} is listed twice`,
      ),
      ...collectRepeats(
        file.relationTypes,
        ['relationTypes'],
        [],
        (name) => `the relation type ${name} is listed twice`,
      ),
      ...Object.entries(file.pipelines).flatMap(([pipeline, steps]) =>
        collectRepeats(
          steps.map((step) => step.phase),
          ['pipelines', pipeline],
          ['phase'],
          (phase) => `the pipeline ${pipeline} names the phase ${phase} twice`,
        ),
      ),
      ...Object.entries(file.kinds).flatMap(([kind, rules]) =>
        Object.hasOwn(file.pipelines, rules.pipeline)
          ? []
          : [
              {
                path: ['kinds', kind, 'pipeline'],
                message: `the file has no pipeline ${rules.pipeline}`,
              },
            ],
      ),
    ]) {
      ctx.addIssue({ code: 'custom', ...issue });
    }
  });

export type ParsedRulesFile = z.output<typeof rulesFileSchema>;

export type ParsedStep = z.output<typeof stepSchema>;

function isCheckoutPath(path: string): boolean {
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

interface FileIssue {
  readonly path: PropertyKey[];
  readonly message: string;
}

function collectRepeats(
  names: readonly string[],
  listPath: readonly PropertyKey[],
  itemPath: readonly PropertyKey[],
  formatMessage: (name: string) => string,
): FileIssue[] {
  return names.flatMap((name, index) =>
    names.indexOf(name) === index
      ? []
      : [{ path: [...listPath, index, ...itemPath], message: formatMessage(name) }],
  );
}
