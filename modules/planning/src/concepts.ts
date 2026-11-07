import type { Concept } from '@boxxy/model';
import { deferConcept } from './concepts/defer.ts';
import { expediteConcept } from './concepts/expedite.ts';
import { poolConcept } from './concepts/pool.ts';

export const concepts: readonly Concept[] = [poolConcept, deferConcept, expediteConcept];
