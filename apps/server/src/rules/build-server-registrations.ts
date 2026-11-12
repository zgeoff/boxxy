import { createReviewPhase, phaseKinds } from '@boxxy/closeout';
import type { PhaseKind, ReviewGate, WorkerKindName } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

export interface ServerRegistrations {
  readonly phases: readonly PhaseKind[];
  readonly workers: readonly WorkerKindName[];
}

// The name of the one worker this server builds.
export const atcWorkerName = brandSchemas.workerKindName.parse('atc.session');

// The phase kinds and worker names that this server loads its rules with, the review phase kind on
// the given gate among them. The server's start and the rules repository's check both load with
// these, so the check refuses what the server refuses.
export function buildServerRegistrations(
  reviewGate: Pick<ReviewGate, 'buildCommand'>,
): ServerRegistrations {
  return { phases: [...phaseKinds, createReviewPhase(reviewGate)], workers: [atcWorkerName] };
}
