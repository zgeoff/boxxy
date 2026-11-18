import type { LoadRejection, SpawnScope } from '@boxxy/model';
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

// A kept session that holds a credential would let a later resume wake it for another phase, and a
// session that wakes the build's session would run with none.
function collectSessionRejections(file: ParsedRulesFile, scope: SpawnScope): LoadRejection[] {
  return Object.entries(file.kinds).flatMap(([itemKind, kind]) =>
    Object.entries(kind.recipes).flatMap(([key, recipe]): LoadRejection[] => {
      const material = file.recipes[recipe];

      if (
        material === undefined ||
        findAgentScope(scope, material.agent) === undefined ||
        material.session !== 'builder'
      ) {
        return [];
      }

      return [
        buildRejection(['kinds', itemKind, 'recipes', key], {
          kind: 'scoped-agent-builder-session',
          itemKind,
          recipe,
          agent: material.agent,
        }),
      ];
    }),
  );
}

function collectResumeRejections(file: ParsedRulesFile, scope: SpawnScope): LoadRejection[] {
  const scopedPhases = new Set(
    Object.values(file.kinds).flatMap((kind) =>
      Object.entries(kind.recipes)
        .filter(([, recipe]) => {
          const agent = file.recipes[recipe]?.agent;

          return agent !== undefined && findAgentScope(scope, agent) !== undefined;
        })
        .map(([key]) => toPhase(key)),
    ),
  );

  return Object.entries(file.pipelines).flatMap(([pipeline, steps]) =>
    steps.flatMap((step, index) =>
      Object.entries(step.on).flatMap(([outcome, edge]): LoadRejection[] =>
        typeof edge === 'object' &&
        'to' in edge &&
        edge.resume === true &&
        scopedPhases.has(edge.to)
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
    ),
  );
}
