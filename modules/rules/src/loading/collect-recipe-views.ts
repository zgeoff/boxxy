import type { RecipeName } from '@boxxy/model';
import { attendedSuffix } from '../constants.ts';

// One recipe a kind runs a phase with, as one view of the rules resolves it.
export interface ViewRecipe {
  // `<phase>` or `<phase>/attended`
  readonly key: string;
  readonly recipe: RecipeName;

  // where the rules file names it: the kind's `recipes`, or the repo's
  readonly path: readonly string[];

  readonly isRepoRecipe: boolean;
}

// What a kind runs in one repo, or in no repo in particular when `repo` is null.
export interface RecipeView {
  readonly repo: string | null;
  readonly recipes: readonly ViewRecipe[];
}

interface ViewInput {
  readonly itemKind: string;
  readonly kindRecipes: Readonly<Record<string, RecipeName>>;

  // the phases of the kind's pipeline: a repo's recipe for any other phase never runs in the kind
  readonly phases: readonly string[];

  // the repos of the server's `spawn.repos`, each with its recipes; a repo with none gets no view
  readonly repos: readonly {
    readonly repo: string;
    readonly recipes: Readonly<Record<string, RecipeName>>;
  }[];
}

// The kind's own recipes, then one view for each repo that names recipes. A key resolves in this
// order, first match wins: the repo's `<phase>/attended`, the repo's `<phase>`, the kind's
// `<phase>/attended`, the kind's `<phase>`; a plain `<phase>` key skips the attended ones.
export function collectRecipeViews(input: ViewInput): RecipeView[] {
  const base: RecipeView = {
    repo: null,
    recipes: Object.entries(input.kindRecipes).map(([key, recipe]) => ({
      key,
      recipe,
      path: ['kinds', input.itemKind, 'recipes', key],
      isRepoRecipe: false,
    })),
  };

  const repoViews = input.repos
    .filter((entry) => Object.keys(entry.recipes).length > 0)
    .map((entry): RecipeView => {
      const repoRecipes = Object.fromEntries(
        Object.entries(entry.recipes).filter(([key]) => input.phases.includes(toPhase(key))),
      );

      const keys = new Set([...Object.keys(input.kindRecipes), ...Object.keys(repoRecipes)]);

      return {
        repo: entry.repo,
        recipes: [...keys].flatMap((key): ViewRecipe[] => {
          const fromRepo = pickRecipeKey(repoRecipes, key);

          if (fromRepo !== undefined) {
            return [
              {
                key,
                recipe: fromRepo.recipe,
                path: ['repos', entry.repo, 'recipes', fromRepo.key],
                isRepoRecipe: true,
              },
            ];
          }

          const fromKind = pickRecipeKey(input.kindRecipes, key);

          return fromKind === undefined
            ? []
            : [
                {
                  key,
                  recipe: fromKind.recipe,
                  path: ['kinds', input.itemKind, 'recipes', fromKind.key],
                  isRepoRecipe: false,
                },
              ];
        }),
      };
    });

  return [base, ...repoViews];
}

function pickRecipeKey(
  recipes: Readonly<Record<string, RecipeName>>,
  key: string,
): { readonly key: string; readonly recipe: RecipeName } | undefined {
  const candidates = key.endsWith(attendedSuffix)
    ? [key, key.slice(0, -attendedSuffix.length)]
    : [key];

  for (const candidate of candidates) {
    const recipe = Object.hasOwn(recipes, candidate) ? recipes[candidate] : undefined;

    if (recipe !== undefined) {
      return { key: candidate, recipe };
    }
  }

  return undefined;
}

// a recipe key is `<phase>` or `<phase>/attended`
export function toPhase(key: string): string {
  return key.endsWith(attendedSuffix) ? key.slice(0, -attendedSuffix.length) : key;
}
