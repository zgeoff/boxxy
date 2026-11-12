import type { PhaseKind } from '@boxxy/model';
import { build } from './phases/build.ts';
import { design } from './phases/design.ts';
import { triage } from './phases/triage.ts';

// The phase kinds that need no port, in pipeline order. The server adds the review phase kind,
// which it builds on its review gate.
export const phaseKinds: readonly PhaseKind[] = [triage, design, build];
