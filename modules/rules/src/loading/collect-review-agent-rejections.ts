import type { LoadRejection } from '@boxxy/model';
import { reviewPhase } from '../constants.ts';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';

// A review agent's broker profile holds the read-only clone token, so only a review session may
// run on one. With review agents named, every review session runs on one, and none is kept, since
// the item's one kept-session slot would let a later resume wake it for a build.
export function collectReviewAgentRejections(
  file: ParsedRulesFile,
  reviewAgents: readonly string[],
): LoadRejection[] {
  if (reviewAgents.length === 0) {
    return [];
  }

  return [...collectRecipeAgentRejections(file, reviewAgents), ...collectResumeRejections(file)];
}

function collectRecipeAgentRejections(
  file: ParsedRulesFile,
  reviewAgents: readonly string[],
): LoadRejection[] {
  return Object.entries(file.kinds).flatMap(([itemKind, kind]) =>
    Object.entries(kind.recipes).flatMap(([key, recipe]): LoadRejection[] => {
      const agent = file.recipes[recipe]?.agent;

      // the loader refuses a recipe the file does not define as missing-recipe
      if (agent === undefined) {
        return [];
      }

      const path = ['kinds', itemKind, 'recipes', key];

      // a key is `<phase>` or `<phase>/attended`
      const isReview = key.replace(/\/attended$/u, '') === reviewPhase;
      const isReviewAgent = reviewAgents.includes(agent);

      if (!isReview && isReviewAgent) {
        return [
          buildRejection(path, {
            kind: 'review-agent-outside-review',
            itemKind,
            phase: key,
            recipe,
          }),
        ];
      }

      if (isReview && !isReviewAgent) {
        return [buildRejection(path, { kind: 'review-without-review-agent', itemKind, recipe })];
      }

      // a review that wakes the build's session runs with no token, and one that finds none starts
      // fresh on the review agent, whose session the item then keeps for the next build
      if (isReview && file.recipes[recipe]?.session === 'builder') {
        return [buildRejection(path, { kind: 'review-builder-session', itemKind, recipe })];
      }

      return [];
    }),
  );
}

function collectResumeRejections(file: ParsedRulesFile): LoadRejection[] {
  return Object.entries(file.pipelines).flatMap(([pipeline, steps]) =>
    steps.flatMap((step, index) =>
      Object.entries(step.on)
        .filter(
          ([, edge]) =>
            typeof edge === 'object' &&
            'to' in edge &&
            edge.to === reviewPhase &&
            edge.resume === true,
        )
        .map(([outcome]) =>
          buildRejection(['pipelines', pipeline, index, 'on', outcome], {
            kind: 'review-session-resumed',
            phase: step.phase,
            outcome,
          }),
        ),
    ),
  );
}
