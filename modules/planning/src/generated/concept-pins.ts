// scripts/write-concept-pins.ts writes this file; run `bun run build` in modules/planning
import { contentHashSchema } from '@boxxy/content-hash';
import type { ConceptName, ConceptPin } from '@boxxy/model';

export const conceptPins: ReadonlyMap<ConceptName, ConceptPin> = new Map([
  [
    'defer',
    {
      ref: 'defer@1',
      sourceHash: contentHashSchema.parse(
        '465c5e5376b2de6814f08888cd479249e494d1986802aa6293e2495b88e846d9',
      ),
    },
  ],
  [
    'expedite',
    {
      ref: 'expedite@1',
      sourceHash: contentHashSchema.parse(
        '672b566d996e4b8d1aeb6e9e768460726473d6f0181a0eedcf09494687679882',
      ),
    },
  ],
  [
    'pool',
    {
      ref: 'pool@1',
      sourceHash: contentHashSchema.parse(
        '93bb6fefe3cf95fc8a15bbe9381733427ba34c2118626449c7828929f895b984',
      ),
    },
  ],
]);
