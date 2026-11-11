// scripts/write-concept-pins.ts writes this file; run `bun run build` in modules/planning
import { contentHashSchema } from '@boxxy/content-hash';
import type { ConceptName, ConceptPin } from '@boxxy/model';

export const conceptPins: ReadonlyMap<ConceptName, ConceptPin> = new Map([
  [
    'defer',
    {
      ref: 'defer@1',
      sourceHash: contentHashSchema.parse(
        '5523aa373e2fc41b8075d161d7c9a942929c627db819b8c4a360b94e11bb0b4b',
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
      ref: 'pool@1',
      sourceHash: contentHashSchema.parse(
        '38ef5559dbd0f53e92a73eb49ee8a930de81f5588b70be3ac10074ed4ae2ab7f',
      ),
    },
  ],
]);
