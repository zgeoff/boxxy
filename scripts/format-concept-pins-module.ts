import type { CollectedPin } from './collect-concept-pins.ts';

export function formatConceptPinsModule(pins: readonly CollectedPin[]): string {
  const entries = pins.map(
    (pin) =>
      `  [${JSON.stringify(pin.name)}, { ref: ${JSON.stringify(pin.ref)}, sourceHash: contentHashSchema.parse(${JSON.stringify(pin.sourceHash)}) }],`,
  );

  return [
    '// scripts/write-concept-pins.ts writes this file; run `bun run build` in modules/planning',
    "import { contentHashSchema } from '@boxxy/content-hash';",
    "import type { ConceptName, ConceptPin } from '@boxxy/model';",
    '',
    'export const conceptPins: ReadonlyMap<ConceptName, ConceptPin> = new Map([',
    ...entries,
    ']);',
    '',
  ].join('\n');
}
