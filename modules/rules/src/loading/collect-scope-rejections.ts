import type { LoadRejection, SpawnScope } from '@boxxy/model';
import { buildPhase } from '../constants.ts';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';
import type { RecipeView, ViewRecipe } from './collect-recipe-views.ts';
import { collectRecipeViews, toPhase } from './collect-recipe-views.ts';

// A listed agent's broker profile holds a credential, so a recipe may name one only for its phases
// and repos. Every repo in `spawn.repos` counts, and a repo's own recipe replaces the kind's for
// that repo only. A recipe key is `<phase>` or `<phase>/attended`.
export function collectScopeRejections(file: ParsedRulesFile, scope: SpawnScope): LoadRejection[] {
  const kinds = Object.entries(file.kinds).map(([itemKind, kind]) => ({
    itemKind,
    pipeline: kind.pipeline,
    views: collectRecipeViews({
      itemKind,
      kindRecipes: kind.recipes,
      phases: (file.pipelines[kind.pipeline] ?? []).map((step) => step.phase),
      repos: scope.repos.map((repo) => ({
        repo,
        recipes: Object.entries(file.repos).find(([name]) => name === repo)?.[1].recipes ?? {},
      })),
    }),
  }));

  return dedupe([
    ...kinds.flatMap((kind) => collectRecipeRejections(file, scope, kind.itemKind, kind.views)),
    ...kinds.flatMap((kind) => collectSessionRejections(file, scope, kind.itemKind, kind.views)),
    ...collectResumeRejections(file, scope, kinds),
  ]);
}

function dedupe(rejections: readonly LoadRejection[]): LoadRejection[] {
  const seen = new Set<string>();

  return rejections.filter((rejection) => {
    const key = JSON.stringify(rejection);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function collectRecipeRejections(
  file: ParsedRulesFile,
  scope: SpawnScope,
  itemKind: string,
  views: readonly RecipeView[],
): LoadRejection[] {
  const [base, ...repoViews] = views;

  const uses = [
    ...(base?.recipes ?? []).map((entry) => ({
      entry,
      repos: scope.repos.filter((repo) => isBaseRecipeUsedIn(repoViews, repo, entry)),
    })),
    ...repoViews.flatMap((view) =>
      view.recipes
        .filter((entry) => entry.isRepoRecipe)
        .map((entry) => ({ entry, repos: view.repo === null ? [] : [view.repo] })),
    ),
  ];

  return uses.flatMap((use): LoadRejection[] => {
    const entry = use.entry;
    const agent = file.recipes[entry.recipe]?.agent;

    // the loader refuses a recipe the file does not define as missing-recipe
    if (agent === undefined) {
      return [];
    }

    const phase = toPhase(entry.key);
    const agentScope = findAgentScope(scope, agent);

    if (agentScope !== undefined && !agentScope.phases.includes(phase)) {
      return [
        buildRejection(entry.path, {
          kind: 'agent-outside-scope',
          itemKind,
          phase: entry.key,
          recipe: entry.recipe,
          agent,
          repo: null,
        }),
      ];
    }

    const allowedRepos = agentScope?.repos;

    const outsideRepo =
      allowedRepos === undefined
        ? undefined
        : use.repos.find((repo) => !allowedRepos.includes(repo));

    if (outsideRepo !== undefined) {
      return [
        buildRejection(entry.path, {
          kind: 'agent-outside-scope',
          itemKind,
          phase: entry.key,
          recipe: entry.recipe,
          agent,
          repo: outsideRepo,
        }),
      ];
    }

    if (scope.phases[phase]?.requireScopedAgent === true && agentScope === undefined) {
      return [
        buildRejection(entry.path, {
          kind: 'phase-without-scoped-agent',
          itemKind,
          phase: entry.key,
          recipe: entry.recipe,
          agent,
        }),
      ];
    }

    return [];
  });
}

// A repo with no view of its own runs the kind's recipes; one with a view runs the kind's recipes
// that its view still holds.
function isBaseRecipeUsedIn(
  repoViews: readonly RecipeView[],
  repo: string,
  entry: ViewRecipe,
): boolean {
  const view = repoViews.find((candidate) => candidate.repo === repo);

  return (
    view === undefined ||
    view.recipes.some((held) => !held.isRepoRecipe && held.path.join('/') === entry.path.join('/'))
  );
}

function findAgentScope(scope: SpawnScope, agent: string) {
  return Object.hasOwn(scope.agents, agent) ? scope.agents[agent] : undefined;
}

// A kept session is the build's, so it holds the credentials of the build's agent. A scoped agent's
// recipe that wakes it would run in a session of another phase, and a recipe that wakes a scoped
// build's session would run with its credentials outside their phase.
function collectSessionRejections(
  file: ParsedRulesFile,
  scope: SpawnScope,
  itemKind: string,
  views: readonly RecipeView[],
): LoadRejection[] {
  return views.flatMap((view) => {
    const buildAgent = findScopedBuildAgent(file, scope, view);

    return view.recipes.flatMap((entry): LoadRejection[] => {
      const material = file.recipes[entry.recipe];

      if (material === undefined || material.session !== 'builder') {
        return [];
      }

      const agent =
        findAgentScope(scope, material.agent) === undefined ? buildAgent : material.agent;

      return agent === undefined
        ? []
        : [
            buildRejection(entry.path, {
              kind: 'scoped-agent-builder-session',
              itemKind,
              recipe: entry.recipe,
              agent,
            }),
          ];
    });
  });
}

// the scoped agent that a view's build recipe names, if any
function findScopedBuildAgent(
  file: ParsedRulesFile,
  scope: SpawnScope,
  view: RecipeView,
): string | undefined {
  return view.recipes
    .filter((entry) => toPhase(entry.key) === buildPhase)
    .map((entry) => file.recipes[entry.recipe]?.agent)
    .find((agent) => agent !== undefined && findAgentScope(scope, agent) !== undefined);
}

interface KindViews {
  readonly itemKind: string;
  readonly pipeline: string;
  readonly views: readonly RecipeView[];
}

// A resume edge wakes the build's kept session, in the kind that runs the pipeline. It is refused
// when that session's agent is scoped, and when the target phase runs a scoped agent in the kind,
// in any repo.
function collectResumeRejections(
  file: ParsedRulesFile,
  scope: SpawnScope,
  kinds: readonly KindViews[],
): LoadRejection[] {
  return Object.entries(file.pipelines).flatMap(([pipeline, steps]) => {
    const views = kinds.filter((kind) => kind.pipeline === pipeline).flatMap((kind) => kind.views);
    const scopedBuild = views.some((view) => findScopedBuildAgent(file, scope, view) !== undefined);

    const scopedPhases = new Set(
      views.flatMap((view) =>
        view.recipes
          .filter((entry) => {
            const agent = file.recipes[entry.recipe]?.agent;

            return agent !== undefined && findAgentScope(scope, agent) !== undefined;
          })
          .map((entry) => toPhase(entry.key)),
      ),
    );

    return steps.flatMap((step, index) =>
      Object.entries(step.on).flatMap(([outcome, edge]): LoadRejection[] =>
        typeof edge === 'object' &&
        'to' in edge &&
        edge.resume === true &&
        (scopedBuild || scopedPhases.has(edge.to))
          ? [
              buildRejection(['pipelines', pipeline, index, 'on', outcome], {
                kind: 'scoped-agent-session-resumed',
                phase: step.phase,
                outcome,
                to: edge.to,
              }),
            ]
          : [],
      ),
    );
  });
}
