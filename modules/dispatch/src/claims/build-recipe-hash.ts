import { contentHash } from '@boxxy/content-hash';
import type { LoadedRules, RecipeHash, RecipeMaterial } from '@boxxy/model';
import { brandSchemas, toJSONValue } from '@boxxy/model';

// The recipe hash covers the recipe's fields, its prompts, the rules version and the skills pin.
export function buildRecipeHash(material: RecipeMaterial, rules: LoadedRules): RecipeHash {
  const hash = contentHash(
    toJSONValue({
      recipe: material.recipe,
      promptHash: material.promptHash,
      ...(material.reworkPromptHash === undefined
        ? {}
        : { reworkPromptHash: material.reworkPromptHash }),
      rulesVersion: material.rulesVersion,
      skills: rules.skills,
    }),
  );

  return brandSchemas.recipeHash.parse(hash);
}
