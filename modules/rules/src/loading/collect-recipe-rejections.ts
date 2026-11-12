import type { LoadRejection } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { buildPhase } from '../constants.ts';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';

export function collectRecipeRejections(file: ParsedRulesFile): LoadRejection[] {
  return [
    ...collectUnmappedSteps(file),
    ...collectUndefinedRecipes(file),
    ...collectSkillsRejections(file),
    ...collectBuilderSessionRejections(file),
  ];
}

function collectUnmappedSteps(file: ParsedRulesFile): LoadRejection[] {
  return Object.entries(file.kinds).flatMap(([itemKind, kind]) => {
    const steps = file.pipelines[kind.pipeline];

    invariant(
      steps,
      `the rules file schema refuses the kind ${itemKind}, whose pipeline is missing`,
    );

    return steps
      .filter((step) => !Object.hasOwn(kind.recipes, step.phase))
      .map((step) =>
        buildRejection(['kinds', itemKind, 'recipes', step.phase], {
          kind: 'step-without-recipe',
          itemKind: brandSchemas.itemKindName.parse(itemKind),
          phase: step.phase,
        }),
      );
  });
}

function collectUndefinedRecipes(file: ParsedRulesFile): LoadRejection[] {
  return Object.entries(file.kinds).flatMap(([itemKind, kind]) =>
    Object.entries(kind.recipes)
      .filter(([, recipe]) => !Object.hasOwn(file.recipes, recipe))
      .map(([phase]) =>
        buildRejection(['kinds', itemKind, 'recipes', phase], {
          kind: 'missing-recipe',
          itemKind,
          phase,
        }),
      ),
  );
}

function collectSkillsRejections(file: ParsedRulesFile): LoadRejection[] {
  if (file.skills !== undefined) {
    return [];
  }

  return Object.entries(file.recipes)
    .filter(([, recipe]) => recipe.skills.length > 0)
    .map(([recipe]) =>
      buildRejection(['recipes', recipe, 'skills'], { kind: 'skills-without-pin', recipe }),
    );
}

// A `session: builder` recipe wakes the session that the item's build kept, so its step needs a
// build step earlier in the same pipeline.
function collectBuilderSessionRejections(file: ParsedRulesFile): LoadRejection[] {
  return Object.entries(file.kinds).flatMap(([itemKind, kind]) => {
    const steps = file.pipelines[kind.pipeline];

    invariant(
      steps,
      `the rules file schema refuses the kind ${itemKind}, whose pipeline is missing`,
    );

    const phases = steps.map((step): string => step.phase);

    return Object.entries(kind.recipes)
      .filter(([key, recipe]) => {
        // a key is `<phase>` or `<phase>/attended`
        const index = phases.indexOf(key.replace(/\/attended$/u, ''));

        return (
          file.recipes[recipe]?.session === 'builder' &&
          index !== -1 &&
          !phases.slice(0, index).includes(buildPhase)
        );
      })
      .map(([key, recipe]) =>
        buildRejection(['kinds', itemKind, 'recipes', key], {
          kind: 'builder-session-not-kept',
          recipe,
        }),
      );
  });
}
