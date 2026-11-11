import type { CloseOutContext, CloseOutParse, CloseOutParser, CloseOutProblem } from '@boxxy/model';
import { formatKeyPath, toJSONValue } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { closeOutLimits } from './close-out-limits.ts';
import { measureJsonBytes } from './measure-json-bytes.ts';

interface SchemaParserInput<Raw, Body> {
  // the body as the agent sends it, with no `frictionDropped`: the parser counts that itself
  readonly schema: z.ZodType<Raw>;
  readonly toBody: (raw: Raw, frictionDropped: number) => Body;

  // the rules of the phase that the schema cannot hold; each problem comes back
  readonly check: (body: Body, ctx: CloseOutContext) => readonly CloseOutProblem[];
}

// The one parse of every phase kind: drop each friction entry with no target, check the
// schema, build the stored body, check the phase's rules, then the stored size. A failed step
// reports every problem it found, and stops the steps after it.
export function buildSchemaParser<Raw, Body>(
  input: SchemaParserInput<Raw, Body>,
): CloseOutParser<Body> {
  return {
    parse: (raw, ctx) => parseCloseOut(input, raw, ctx),
    jsonSchema: toJSONValue(z.toJSONSchema(input.schema)),
  };
}

function parseCloseOut<Raw, Body>(
  input: SchemaParserInput<Raw, Body>,
  raw: unknown,
  ctx: CloseOutContext,
): CloseOutParse<Body> {
  const split = splitFriction(raw);
  const parsed = input.schema.safeParse(split.candidate);

  if (!parsed.success) {
    return {
      kind: 'invalid',
      problems: parsed.error.issues.map((issue) => buildSchemaProblem(issue, split.keptRawIndexes)),
    };
  }

  const body = input.toBody(parsed.data, split.dropped);
  const problems = input.check(body, ctx);

  if (problems.length > 0) {
    return { kind: 'invalid', problems };
  }

  const bytes = measureJsonBytes(toJSONValue(body));

  return bytes > closeOutLimits.closeOutBytes
    ? {
        kind: 'invalid',
        problems: [{ kind: 'too-large', bytes, max: closeOutLimits.closeOutBytes }],
      }
    : { kind: 'valid', closeOut: body };
}

interface FrictionSplit {
  readonly candidate: unknown;
  readonly keptRawIndexes: readonly number[];
  readonly dropped: number;
}

// An agent's count of dropped entries is not trusted: the key is removed, and the parser counts.
function splitFriction(raw: unknown): FrictionSplit {
  if (!isRecord(raw)) {
    return { candidate: raw, keptRawIndexes: [], dropped: 0 };
  }

  const { frictionDropped: _, ...rest } = raw;
  const entries: readonly unknown[] = Array.isArray(rest['friction']) ? rest['friction'] : [];
  const keptRawIndexes = entries.flatMap((entry, index) => (isUntargeted(entry) ? [] : [index]));

  const friction = Array.isArray(rest['friction'])
    ? keptRawIndexes.map((index) => entries[index])
    : rest['friction'];

  return {
    candidate: { ...rest, friction },
    keptRawIndexes,
    dropped: entries.length - keptRawIndexes.length,
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
