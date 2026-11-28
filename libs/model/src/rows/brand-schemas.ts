import { contentHashSchema } from '@boxxy/content-hash';
import { z } from 'zod';

const uuidV7Schema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);

// the short reference of an item: `i-` and its number, counted up from 1 in filing order
export const itemRefPattern = /^i-[1-9][0-9]*$/u;
const itemRefSchema = z.string().regex(itemRefPattern);
const nameSchema = z.string().min(1);

export const brandSchemas = {
  instant: z.number().int().nonnegative().brand<'Instant'>(),
  itemId: uuidV7Schema.brand<'ItemId'>(),
  itemRef: itemRefSchema.brand<'ItemRef'>(),
  attemptId: uuidV7Schema.brand<'AttemptId'>(),
  decisionId: uuidV7Schema.brand<'DecisionId'>(),
  capacityRefusalId: uuidV7Schema.brand<'CapacityRefusalId'>(),
  factId: uuidV7Schema.brand<'FactId'>(),
  runnerId: z
    .string()
    .regex(/^[a-z0-9-]+$/u)
    .brand<'RunnerId'>(),
  atcSessionId: nameSchema.brand<'AtcSessionId'>(),
  agentSessionId: nameSchema.brand<'AgentSessionId'>(),
  commitSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/u)
    .brand<'CommitSha'>(),
  repoName: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/u)
    .brand<'RepoName'>(),
  criterionId: z
    .string()
    .regex(/^a[1-9]\d*$/u)
    .brand<'CriterionId'>(),
  itemKindName: nameSchema.brand<'ItemKindName'>(),
  relationTypeName: nameSchema.brand<'RelationTypeName'>(),
  phaseName: nameSchema.brand<'PhaseName'>(),
  pipelineName: nameSchema.brand<'PipelineName'>(),
  poolName: nameSchema.brand<'PoolName'>(),
  limitName: nameSchema.brand<'LimitName'>(),
  outcomeName: nameSchema.brand<'OutcomeName'>(),
  rulesHoldReason: nameSchema.brand<'RulesHoldReason'>(),
  recipeName: nameSchema.brand<'RecipeName'>(),
  workerKindName: nameSchema.brand<'WorkerKindName'>(),
  sourceName: nameSchema.brand<'SourceName'>(),
  streamName: nameSchema.brand<'StreamName'>(),
  recipeHash: contentHashSchema.brand<'RecipeHash'>(),
  snapshotHash: contentHashSchema.brand<'SnapshotHash'>(),
  rulesVersion: contentHashSchema.brand<'RulesVersion'>(),
};
