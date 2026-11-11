// scripts/write-concept-pins.ts writes this file; run `bun run build` in modules/planning
import { contentHashSchema } from '@boxxy/content-hash';
import type { ConceptName, ConceptPin } from '@boxxy/model';

export const conceptPins: ReadonlyMap<ConceptName, ConceptPin> = new Map([
  [
    'defer',
    {
      ref: 'defer@1',
      sourceHash: contentHashSchema.parse(
        'cbe173e108ca3b290f7f48ea3a4145b28f44611ae7f4a43d29430f08b88f46df',
      ),
    },
  ],
  [
    'expedite',
    {
      ref: 'expedite@1',
      sourceHash: contentHashSchema.parse(
        'f75e37b479e49da4e68aab6f3d8e9960b04608eb7a9fdd53d4349578e1c213d3',
      ),
    },
  ],
  [
    'pool',
    {
      ref: 'pool@2',
      sourceHash: contentHashSchema.parse(
        '1631a22966bd50fa39a8acc79f242fb0ac6603ead15b8f4ca3907f5e2cdd1214',
      ),
    },
  ],
]);
