import type { Concept } from '@boxxy/model';
import { defer } from './concepts/defer.ts';
import { expedite } from './concepts/expedite.ts';
import { pool } from './concepts/pool.ts';

export const concepts: readonly Concept[] = [pool, defer, expedite];
