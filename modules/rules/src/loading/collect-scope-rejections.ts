import type { LoadRejection, RecipeName, SpawnScope } from '@boxxy/model';
import { buildPhase } from '../constants.ts';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';

// A listed agent's broker profile holds a credential, so a recipe may name one only for its phases
// and repos. Every repo in `spawn.repos` counts, since a recipe resolves for the item's repo.
// A recipe key is `<phase>` or `<phase>/attended`.
export function collectScopeRejections(file: ParsedRulesFile, scope: SpawnScope): LoadRejection[] {
  return [
    ...collectRecipeRejections(file, scope),
    ...collectSessionRejections(file, scope),
    ...collectResumeRejections(file, scope),
  ];
}

function collectRecipeRejections(file: ParsedRulesFile, scope: SpawnScope): LoadRejection[] {
  return Object.entries(file.kinds).flatMap(([itemKind, kind]) =>
    Object.entries(kind.recipes).flatMap(([key, recipe]): LoadRejection[] => {
      const agent = file.recipes[recipe]?.agent;

      // the loader refuses a recipe the file does not define as missing-recipe
      if (agent === undefined) {
        return [];
      }

      const path = ['kinds', itemKind, 'recipes', key];
      const phase = toPhase(key);
      const entry = findAgentScope(scope, agent);

      if (entry !== undefined && !entry.phases.includes(phase)) {
        return [
          buildRejection(path, {
            kind: 'agent-outside-scope',
            itemKind,
            phase: key,
            recipe,
            agent,
            repo: null,
          }),
        ];
      }

      const outsideRepo =
        entry?.repos === undefined
          ? undefined
          : scope.repos.find((repo) => !(entry.repos ?? []).includes(repo));

      if (outsideRepo !== undefined) {
        return [
          buildRejection(path, {
            kind: 'agent-outside-scope',
            itemKind,
            phase: key,
            recipe,
            agent,
            repo: outsideRepo,
          }),
        ];
      }

      if (scope.phases[phase]?.requireScopedAgent === true && entry === undefined) {
        return [
          buildRejection(path, {
            kind: 'phase-without-scoped-agent',
            itemKind,
            phase: key,
            recipe,
            agent,
          }),
        ];
      }

      return [];
    }),
  );
}

function toPhase(key: string): string {
  return key.replace(/\/attended$/u, '');
}

function findAgentScope(scope: SpawnScope, agent: string) {
  return Object.hasOwn(scope.agents, agent) ? scope.agents[agent] : undefined;
}

// A kept session is the build's, so it holds the credentials of the build's agent. A scoped agent's
// recipe that wakes it would run in a session of another phase, and a recipe that wakes a scoped
// build's session would run with its credentials outside their phase.
function collectSessionRejections(file: ParsedRulesFile, scope: SpawnScope): LoadRejection[] {
  return Object.entries(file.kinds).flatMap(([itemKind, kind]) => {
    const buildAgent = findScopedBuildAgent(file, scope, kind.recipes);

    return Object.entries(kind.recipes).flatMap(([key, recipe]): LoadRejection[] => {
      const material = file.recipes[recipe];

      if (material === undefined || material.session !== 'builder') {
        return [];
      }

      const agent =
        findAgentScope(scope, material.agent) === undefined ? buildAgent : material.agent;

      return agent === undefined
        ? []
        : [
            buildRejection(['kinds', itemKind, 'recipes', key], {
              kind: 'scoped-agent-builder-session',
              itemKind,
              recipe,
              agent,
            }),
          ];
    });
  });
}

// the scoped agent that a kind's build recipe names, if any
function findScopedBuildAgent(
  file: ParsedRulesFile,
  scope: SpawnScope,
  recipes: Readonly<Record<string, RecipeName>>,
): string | undefined {
  return Object.entries(recipes)
    .filter(([key]) => toPhase(key) === buildPhase)
    .map(([, recipe]) => file.recipes[recipe]?.agent)
    .find((agent) => agent !== undefined && findAgentScope(scope, agent) !== undefined);
}

// A resume edge wakes the build's kept session, in the kind that runs the pipeline. It is refused
// when that session's agent is scoped, and when the target phase runs a scoped agent in the kind.
function collectResumeRejections(file: ParsedRulesFile, scope: SpawnScope): LoadRejection[] {
  return Object.entries(file.pipelines).flatMap(([pipeline, steps]) => {
    const kinds = Object.values(file.kinds).filter((kind) => kind.pipeline === pipeline);

    const scopedBuild = kinds.some(
      (kind) => findScopedBuildAgent(file, scope, kind.recipes) !== undefined,
    );

    const scopedPhases = new Set(
      kinds.flatMap((kind) =>
        Object.entries(kind.recipes)
          .filter(([, recipe]) => {
            const agent = file.recipes[recipe]?.agent;

            return agent !== undefined && findAgentScope(scope, agent) !== undefined;
          })
          .map(([key]) => toPhase(key)),
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
