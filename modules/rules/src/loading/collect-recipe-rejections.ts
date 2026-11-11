import type { LoadRejection } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';

export function collectRecipeRejections(file: ParsedRulesFile): LoadRejection[] {
  return [
    ...collectUnmappedSteps(file),
    ...collectUndefinedRecipes(file),
    ...collectSkillsRejections(file),
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
