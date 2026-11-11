import type { Effort, PipelineStep, RulesFile } from '@boxxy/model';
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

const kindSchema = z
  .strictObject({
    pipeline: z.array(brandSchemas.phaseName).min(1),
    maxAttempts: z.record(brandSchemas.phaseName, z.int().positive()),
    recipes: z.record(brandSchemas.phaseName, brandSchemas.recipeName),
  })
  .transform((kind, ctx) => {
    const steps: PipelineStep[] = [];

    for (const phase of kind.pipeline) {
      const maxAttempts = Object.hasOwn(kind.maxAttempts, phase)
        ? kind.maxAttempts[phase]
        : undefined;

      if (maxAttempts === undefined) {
        ctx.issues.push({
          code: 'custom',
          input: kind.maxAttempts,
          path: ['maxAttempts', phase],
          message: `the pipeline phase ${phase} has no maxAttempts`,
        });
      } else {
        steps.push({ phase, maxAttempts });
      }
    }

    return { ...kind, steps };
  });

const takesValueSchema = z.union([nameSchema, z.array(nameSchema).min(1)]);

const poolSchema = z.strictObject({
  name: brandSchemas.poolName,
  slots: z.int().positive(),
  takes: z.record(nameSchema, takesValueSchema),
  order: z.array(pluginRefSchema),
});

const efforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const satisfies readonly Effort[];

const recipeSchema = z.strictObject({
  agent: nameSchema,
  model: nameSchema,
  effort: z.enum(efforts),
  prompt: nameSchema.refine(isCheckoutPath, {
    message: 'a prompt path runs from the checkout root, with no empty, "." or ".." folder',
  }),
  source: brandSchemas.sourceName,
});

const conceptEntrySchema = z.templateLiteral([nameSchema, '@', z.int().positive()]);

const propagationLineSchema = z.strictObject({
  value: nameSchema,
  over: brandSchemas.relationTypeName,
  toward: z.enum(['source', 'target']),
});

export const rulesFileSchema = z
  .strictObject({
    version: z.literal(1),
    concepts: z.array(conceptEntrySchema),
    kinds: z.record(brandSchemas.itemKindName, kindSchema),
    pools: z.array(poolSchema),
    lead: z.array(pluginRefSchema),
    propagation: z.array(propagationLineSchema),
    recipes: z.record(brandSchemas.recipeName, recipeSchema),
  })
  .superRefine((file, ctx) => {
    const conceptNames = file.concepts.map((entry) => parseConceptEntry(entry).name);
    const poolNames: string[] = file.pools.map((pool) => pool.name);

    for (const [index, name] of conceptNames.entries()) {
      if (conceptNames.indexOf(name) !== index) {
        ctx.addIssue({
          code: 'custom',
          path: ['concepts', index],
          message: `the concept ${name} is pinned twice`,
        });
      }
    }

    for (const [index, name] of poolNames.entries()) {
      if (poolNames.indexOf(name) !== index) {
        ctx.addIssue({
          code: 'custom',
          path: ['pools', index, 'name'],
          message: `the pool name ${name} is used twice`,
        });
      }
    }
  }) satisfies z.ZodType<RulesFile>;

export type ParsedRulesFile = z.output<typeof rulesFileSchema>;

function isCheckoutPath(path: string): boolean {
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
