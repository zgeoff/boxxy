import { createReviewPhase, phaseKinds } from '@boxxy/closeout';
import type { PhaseKind, ReviewGate, WorkerKindName } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

export interface ServerRegistrations {
  readonly phases: readonly PhaseKind[];
  readonly workers: readonly WorkerKindName[];

  // the atc agents that only review recipes may name
  readonly reviewAgents: readonly string[];
}

// The session worker, which every server builds.
export const atcWorkerName = brandSchemas.workerKindName.parse('atc.session');

// The merge's job worker, which a server builds only with a `github` section.
export const mergeWorkerName = brandSchemas.workerKindName.parse('merge.forge');

// The phase kinds, worker names and review agents that this server loads its rules with, the
// review phase kind on the given gate among them. The server's start passes the workers it built,
// and the rules repository's check passes both, so it checks rules for a server with a forge.
export function buildServerRegistrations(
  reviewGate: Pick<ReviewGate, 'buildCommand'>,
  reviewAgents: readonly string[],
  workers: readonly WorkerKindName[] = [atcWorkerName, mergeWorkerName],
): ServerRegistrations {
  return {
    phases: [...phaseKinds, createReviewPhase(reviewGate)],
    workers,
    reviewAgents,
  };
}
