import type { ItemKindName, PhaseName, RecipeName, RepoName, SessionMode } from '../types.ts';
import type { KindRules, RepoPolicy } from './types.ts';

interface RecipeRules {
  readonly kinds: ReadonlyMap<ItemKindName, KindRules>;
  readonly repos: ReadonlyMap<RepoName, RepoPolicy>;
}

interface RecipeItem {
  readonly kind: ItemKindName;
  readonly repo: RepoName;
}

// The recipe that runs a phase for an item of this kind in this repo. The first match wins: the
// repo's `<phase>/attended`, the repo's `<phase>`, the kind's `<phase>/attended`, the kind's
// `<phase>`. An `/attended` entry counts only in the attended mode. Undefined when none names one.
export function findRecipeName(
  rules: RecipeRules,
  item: RecipeItem,
  phase: PhaseName,
  mode: SessionMode,
): RecipeName | undefined {
  const layers = [rules.repos.get(item.repo)?.recipes, rules.kinds.get(item.kind)?.recipes];
  const keys = mode === 'attended' ? [`${phase}/attended`, phase] : [phase];

  return layers
    .flatMap((recipes) => keys.map((key) => recipes?.[key]))
    .find((name) => name !== undefined);
}
