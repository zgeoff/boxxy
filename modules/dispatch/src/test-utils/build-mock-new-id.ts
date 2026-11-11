import type { NewId } from '@boxxy/model';

// A new-ID source that gives version 7 UUIDs in order: 1, 2, 3, … in the last group.
export function buildMockNewId(): NewId {
  let count = 0;

  return () => {
    count += 1;

    return `0190a6f4-0000-7000-8000-${String(count).padStart(12, '0')}`;
  };
}
