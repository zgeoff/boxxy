import { createReviewPhase, phaseKinds } from '@boxxy/closeout';
import { createShippedWaitKind } from '@boxxy/dispatch';
import type { PhaseKind, ReviewGate, SpawnScope, WaitKind, WorkerKindName } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

export interface ServerRegistrations {
  readonly phases: readonly PhaseKind[];

  // the wait kinds; `shipped` needs the merge worker, so a server with no `github` section
  // refuses a step that waits on it
  readonly waits: readonly WaitKind[];
  readonly workers: readonly WorkerKindName[];

  // where each credentialed atc agent may run
  readonly spawn: SpawnScope;
}

// The session worker, which every server builds.
export const atcWorkerName = brandSchemas.workerKindName.parse('atc.session');

// The merge's job worker, which a server builds only with a `github` section.
export const mergeWorkerName = brandSchemas.workerKindName.parse('merge.forge');

// The phase kinds, worker names and spawn scope that this server loads its rules with, the
// review phase kind on the given gate among them. The server's start passes the workers it built,
// and the rules repository's check passes both, so it checks rules for a server with a forge.
export function buildServerRegistrations(
  reviewGate: Pick<ReviewGate, 'buildCommand'>,
  spawn: SpawnScope,
  workers: readonly WorkerKindName[] = [atcWorkerName, mergeWorkerName],
): ServerRegistrations {
  return {
    phases: [...phaseKinds, createReviewPhase(reviewGate)],
    waits: [createShippedWaitKind(mergeWorkerName)],
    workers,
    spawn,
  };
}
