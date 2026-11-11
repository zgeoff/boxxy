import type { NoteRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';

export function buildMockNoteChange(note: NoteRow): StoreChange {
  return {
    at: note.at,
    writes: [{ op: 'insert', table: 'notes', row: note }],
    facts: [
      {
        id: buildMockFactId(),
        type: 'boxxy.item.noted',
        entity: `boxxy:item:${note.item}`,
        actor: note.by,
        payload: { seq: note.seq, text: note.text },
      },
    ],
  };
}
