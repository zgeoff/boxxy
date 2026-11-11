import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockNoteChange } from './build-mock-note-change.ts';

test('it builds a change that appends the note with its noted fact', () => {
  const note = {
    item: brandSchemas.itemId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b70'),
    seq: 2,
    text: 'The flicker is gone after the firmware update.',
    by: 'boxxy:owner:local',
    at: brandSchemas.instant.parse(4500),
  } as const;

  const change: unknown = buildMockNoteChange(note);

  expect(change).toStrictEqual({
    at: 4500,
    writes: [{ op: 'insert', table: 'notes', row: note }],
    facts: [
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
        type: 'boxxy.item.noted',
        entity: 'boxxy:item:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b70',
        actor: 'boxxy:owner:local',
        payload: { seq: 2, text: 'The flicker is gone after the firmware update.' },
      },
    ],
  });
});
