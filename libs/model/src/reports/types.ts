import type { z } from 'zod';
import type { costToLandSchema } from './cost-to-land-schema.ts';
import type { stageTimeSchema } from './stage-time-schema.ts';

export type CostToLand = z.output<typeof costToLandSchema>;

export type StageTime = z.output<typeof stageTimeSchema>;
