import type { PhaseKind } from '@boxxy/model';
import { build } from './phases/build.ts';
import { design } from './phases/design.ts';
import { merge } from './phases/merge.ts';
import { triage } from './phases/triage.ts';
import { verify } from './phases/verify.ts';

// The phase kinds that need no port, in pipeline order. The server adds the review phase kind,
// which it builds on its review gate. The merge phase kind loads only on a server that builds its
// job worker, because the loader refuses a step whose worker the server did not build.
export const phaseKinds: readonly PhaseKind[] = [triage, design, build, verify, merge];
