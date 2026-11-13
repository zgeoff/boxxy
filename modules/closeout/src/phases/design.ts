import type { AcceptanceInput, DesignCloseOut, Effect } from '@boxxy/model';
import { brandSchemas, definePhase, designCloseOutSchema, toJSONValue } from '@boxxy/model';
import { match } from 'ts-pattern';
import type { z } from 'zod';
import { buildSchemaParser } from '../build-schema-parser.ts';
import { buildCriteria } from '../utils/build-criteria.ts';
import { buildCriterionTexts } from '../utils/build-criterion-texts.ts';

const designBodySchema = designCloseOutSchema.omit({ frictionDropped: true });

export const design = definePhase({
  name: brandSchemas.phaseName.parse('design'),
  version: 1,
  worker: brandSchemas.workerKindName.parse('atc.session'),
  outcomes: ['designed', 'blocked', 'abandoned'],
  needsAcceptance: true,
  mode: (item) => (item.fields.designMode === 'attended' ? 'attended' : 'agent'),
  input: (ctx) =>
    toJSONValue({ acceptance: buildCriterionTexts(ctx.item) } satisfies AcceptanceInput),
  closeOut: buildSchemaParser({
    schema: designBodySchema,
    toBody: (raw: z.output<typeof designBodySchema>, frictionDropped): DesignCloseOut => ({
      ...raw,
      frictionDropped,
    }),
    check: () => [],
  }),

  // A blocked or abandoned design did not reach its goal, so its attempt fails. The failure is
  // the outcome name, never the agent's free text; the reason stays in the close-out.
  settle: (input) => ({
    ...match(input.closeOut.result)
      .with({ kind: 'designed' }, () => ({ state: 'succeeded' as const, failure: null }))
      .with({ kind: 'blocked' }, { kind: 'abandoned' }, (ended) => ({
        state: 'failed' as const,
        failure: ended.kind,
      }))
      .exhaustive(),
    outcome: input.closeOut.result.kind,
    effects: collectDesignEffects(input.closeOut),
    frictionDropped: input.closeOut.frictionDropped,
  }),
});

function collectDesignEffects(closeOut: DesignCloseOut): Effect[] {
  const designed = closeOut.result.kind === 'designed' ? closeOut.result : null;
  const acceptance = designed?.set?.acceptance;

  return [
    ...(designed?.openItems ?? []).map((openItem) => ({
      kind: 'file-item' as const,
      item: openItem,
    })),
    ...(acceptance === undefined
      ? []
      : [{ kind: 'set-acceptance' as const, criteria: buildCriteria(acceptance) }]),
    ...closeOut.friction.map((friction) => ({ kind: 'record-proposal' as const, friction })),
  ];
}
