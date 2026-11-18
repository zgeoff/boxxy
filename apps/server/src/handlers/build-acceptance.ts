import type { Criterion, ItemView } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { ORPCError } from '@orpc/server';
import type { ServerDeps } from '../types.ts';

export interface CriterionDraft {
  readonly text: string;
  readonly tags?: readonly string[] | undefined;
}

export interface CriterionEdit extends CriterionDraft {
  readonly id?: string | undefined;
}

// A tag that the rules file does not list is refused, so no line holds a tag that no step reads.
export function refuseUnknownTags(deps: ServerDeps, tags: readonly string[]): void {
  const listed = new Set(deps.rulesState().rules.criterionTags);

  const unknown = tags.find((tag) => !listed.has(tag));

  if (unknown !== undefined) {
    throw new ORPCError('BAD_REQUEST', {
      message: `the rules file lists no criterion tag ${unknown}`,
    });
  }
}

export function buildCriterion(index: number, draft: CriterionDraft): Criterion {
  return {
    id: brandSchemas.criterionId.parse(`a${index}`),
    text: draft.text,
    evidence: [],
    ...buildTags(draft.tags),
  };
}

// An entry with the ID of a criterion keeps that criterion's evidence; an entry with no ID is a
// new criterion. null: an entry names a criterion the item does not have.
export function buildAcceptance(
  item: ItemView,
  entries: readonly CriterionEdit[],
): Criterion[] | null {
  const known = new Map(item.acceptance.map((criterion) => [String(criterion.id), criterion]));

  let next = Math.max(0, ...item.acceptance.map((criterion) => Number(criterion.id.slice(1))));
  const built: Criterion[] = [];

  for (const entry of entries) {
    if (entry.id === undefined) {
      next += 1;

      built.push(buildCriterion(next, entry));
      continue;
    }

    const kept = known.get(entry.id);

    if (kept === undefined) {
      return null;
    }

    const { tags: _tags, ...rest } = kept;
    const tags = entry.tags ?? kept.tags;

    built.push({ ...rest, text: entry.text, ...buildTags(tags) });
  }

  return built;
}

// no field when the line has no tag, as a line filed before tags existed has none
function buildTags(tags: readonly string[] | undefined): { tags?: readonly string[] } {
  return tags === undefined || tags.length === 0 ? {} : { tags };
}
