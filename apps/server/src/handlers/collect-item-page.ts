import type { ItemListView, ItemView, ItemWithLevers, NoteRow } from '@boxxy/model';

export interface ItemPageEntry {
  readonly item: ItemWithLevers;
  readonly notes: readonly NoteRow[];
}

export interface ItemPageFilter {
  readonly phase?: string | undefined;
  readonly text?: string | undefined;
  readonly label?: string | undefined;
  readonly limit: number;
  readonly after?: string | undefined;
}

export interface ItemPage {
  readonly items: ItemListView[];
  readonly next: string | null;
}

// One page of a list of items, newest first. `next` is the last ID of the page when more follow.
export function collectItemPage(
  entries: readonly ItemPageEntry[],
  filter: ItemPageFilter,
): ItemPage {
  const matched = entries
    .filter((entry) => isListMatch(entry.item, entry.notes, filter))
    .map((entry) => entry.item)
    .toSorted(
      (first, second) => second.filedAt - first.filedAt || second.id.localeCompare(first.id),
    );

  const start =
    filter.after === undefined ? 0 : matched.findIndex((item) => item.id === filter.after) + 1;

  const page = matched.slice(start, start + filter.limit);
  const last = page.at(-1);

  return {
    items: page.map((item) => toItemListView(item)),
    next: last !== undefined && start + filter.limit < matched.length ? last.id : null,
  };
}

function isListMatch(item: ItemView, notes: readonly NoteRow[], filter: ItemPageFilter): boolean {
  const text = filter.text?.toLowerCase();

  return (
    (filter.phase === undefined ||
      (item.position.kind === 'phase' && item.position.phase === filter.phase)) &&
    (filter.label === undefined || item.labels.includes(filter.label)) &&
    (text === undefined ||
      [item.title, item.outcome, ...notes.map((note) => note.text)].some((value) =>
        value.toLowerCase().includes(text),
      ))
  );
}

function toItemListView(item: ItemWithLevers): ItemListView {
  const { levers: _levers, body: _body, ...view } = item;

  return view;
}
