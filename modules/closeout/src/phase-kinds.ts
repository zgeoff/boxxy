import type { PhaseKind } from '@boxxy/model';
import { build } from './phases/build.ts';
import { design } from './phases/design.ts';
import { review } from './phases/review.ts';
import { triage } from './phases/triage.ts';

// The phase kinds that the server passes to the rules loader, in pipeline order
export const phaseKinds: readonly PhaseKind[] = [triage, design, build, review];
