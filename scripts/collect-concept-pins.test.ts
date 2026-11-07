import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { conceptPins, concepts } from '../modules/planning/src/index.ts';
import { collectConceptPins } from './collect-concept-pins.ts';
import { formatConceptPinsModule } from './format-concept-pins-module.ts';
import { readPlanningSources } from './read-planning-sources.ts';

test.each([
  [
    'the concept module',
    'concepts/snooze.ts',
    "import type { Wakf } from '../types.ts';\nimport { readWakeTime } from '../read-wake-time.ts';\n",
  ],
  ['a file the concept imports', 'read-wake-time.ts', 'export const readWakeTime = () => 8;\n'],
  ['a file the concept imports only for a type', 'types.ts', 'export type Wake = 2;\n'],
])('it changes the generated module when one byte of %s changes', (_label, path, text) => {
  const encoder = new TextEncoder();

  const refs = [{ name: 'snooze', version: 1 }];

  const files = new Map([
    [
      'concepts/snooze.ts',
      encoder.encode(
        "import type { Wake } from '../types.ts';\nimport { readWakeTime } from '../read-wake-time.ts';\n",
      ),
    ],
    ['read-wake-time.ts', encoder.encode('export const readWakeTime = () => 9;\n')],
    ['types.ts', encoder.encode('export type Wake = 1;\n')],
  ]);

  const edited = new Map([...files, [path, encoder.encode(text)]]);

  expect(formatConceptPinsModule(collectConceptPins(refs, edited))).not.toBe(
    formatConceptPinsModule(collectConceptPins(refs, files)),
  );
});

test('it keeps the pin when a file the concept does not import changes', () => {
  const encoder = new TextEncoder();

  const refs = [{ name: 'snooze', version: 1 }];

  const files = new Map([
    ['concepts/snooze.ts', encoder.encode('export const snooze = 1;\n')],
    ['decide.ts', encoder.encode('export const decide = 1;\n')],
  ]);

  const edited = new Map([...files, ['decide.ts', encoder.encode('export const decide = 2;\n')]]);

  expect(collectConceptPins(refs, edited)).toStrictEqual(collectConceptPins(refs, files));
});

test('it throws on a relative import that names no source file', () => {
  const refs = [{ name: 'snooze', version: 1 }];

  const files = new Map([
    ['concepts/snooze.ts', new TextEncoder().encode("import { gone } from '../gone.ts';\n")],
  ]);

  expect(() => collectConceptPins(refs, files)).toThrowWithMessage(
    Error,
    /gone\.ts is not a source file/u,
  );
});

test("it matches the committed concept pins to each concept's source", () => {
  const collected = collectConceptPins(concepts, readPlanningSources(join(import.meta.dir, '..')));

  expect(conceptPins).toStrictEqual(
    new Map(collected.map((pin) => [pin.name, { ref: pin.ref, sourceHash: pin.sourceHash }])),
  );
});
