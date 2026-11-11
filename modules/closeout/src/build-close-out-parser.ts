import type {
  BuildCloseOut,
  SliceOneCloseOutContext as CloseOutContext,
  CloseOutParse,
  SliceOneCloseOutParser as CloseOutParser,
  CloseOutProblem,
} from '@boxxy/model';
import { buildCloseOutSchema, formatKeyPath } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { missingCriteria } from './missing-criteria.ts';

export const buildCloseOutParser: CloseOutParser<BuildCloseOut> = { parse: parseBuildCloseOut };

function parseBuildCloseOut(raw: unknown, ctx: CloseOutContext): CloseOutParse<BuildCloseOut> {
  const split = splitFriction(raw);
  const parsed = buildCloseOutSchema.safeParse(split.candidate);

  if (!parsed.success) {
    return {
      kind: 'invalid',
      problems: parsed.error.issues.map((issue) => buildSchemaProblem(issue, split.keptRawIndexes)),
    };
  }

  const problems = collectProblems(parsed.data, ctx);

  return problems.length === 0
    ? { kind: 'valid', closeOut: parsed.data }
    : { kind: 'invalid', problems };
}

interface FrictionSplit {
  readonly candidate: unknown;
  readonly keptRawIndexes: readonly number[];
}

function splitFriction(raw: unknown): FrictionSplit {
  if (!isRecord(raw)) {
    return { candidate: raw, keptRawIndexes: [] };
  }

  const entries: readonly unknown[] = Array.isArray(raw['friction']) ? raw['friction'] : [];
  const keptRawIndexes = entries.flatMap((entry, index) => (isUntargeted(entry) ? [] : [index]));

  const friction = Array.isArray(raw['friction'])
    ? keptRawIndexes.map((index) => entries[index])
    : raw['friction'];

  return {
    candidate: { ...raw, friction, frictionDropped: entries.length - keptRawIndexes.length },
    keptRawIndexes,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUntargeted(entry: unknown): boolean {
  return isRecord(entry) && (entry['target'] === undefined || entry['target'] === null);
}

interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

function buildSchemaProblem(
  issue: SchemaIssue,
  keptRawIndexes: readonly number[],
): CloseOutProblem {
  return {
    kind: 'schema',
    path: formatKeyPath(toRawPath(issue.path, keptRawIndexes)),
    message: issue.message,
  };
}

function toRawPath(path: readonly PropertyKey[], keptRawIndexes: readonly number[]): PropertyKey[] {
  const [field, index, ...rest] = path;

  if (field !== 'friction' || typeof index !== 'number') {
    return [...path];
  }

  const rawIndex = keptRawIndexes[index];

  invariant(rawIndex !== undefined, 'a friction issue points at an entry the parser kept');

  return [field, rawIndex, ...rest];
}

function collectProblems(closeOut: BuildCloseOut, ctx: CloseOutContext): CloseOutProblem[] {
  const acceptance = new Set(ctx.item.acceptance.map((criterion) => criterion.id));
  const own = new Set(ctx.evidence.map((row) => row.factId));

  const cited = closeOut.criteria;

  const unknownCriteria = new Set(
    cited.map((entry) => entry.criterion).filter((id) => !acceptance.has(id)),
  );

  const foreignEvidence = new Set(
    cited.map((entry) => entry.evidence).filter((id) => !own.has(id)),
  );

  const missing =
    closeOut.result.kind === 'built' ? missingCriteria(ctx.item, ctx.evidence, cited) : [];

  return [
    ...[...unknownCriteria].map((criterion) => ({ kind: 'unknown-criterion' as const, criterion })),
    ...[...foreignEvidence].map((evidence) => ({ kind: 'foreign-evidence' as const, evidence })),
    ...(missing.length > 0 ? [{ kind: 'built-without-evidence' as const, criteria: missing }] : []),
  ];
}
