import type { ItemId, SliceOneItemView as ItemView, OpenItem } from '@boxxy/model';
import { normaliseTitle } from './normalise-title.ts';

export function dedupeOpenItems(
  entries: readonly OpenItem[],
  open: readonly ItemView[],
): { readonly file: readonly OpenItem[]; readonly matched: readonly ItemId[] } {
  const openByTitle = collectOpenByTitle(open);
  const matched = entries.flatMap((entry) => openByTitle.get(normaliseTitle(entry.title)) ?? []);

  return { file: collectNewEntries(entries, openByTitle), matched: [...new Set(matched)] };
}

function collectOpenByTitle(open: readonly ItemView[]): Map<string, ItemId> {
  const openByTitle = new Map<string, ItemId>();

  for (const item of open) {
    const title = normaliseTitle(item.title);

    if (!openByTitle.has(title)) {
      openByTitle.set(title, item.id);
    }
  }

  return openByTitle;
}

function collectNewEntries(
  entries: readonly OpenItem[],
  openByTitle: ReadonlyMap<string, ItemId>,
): OpenItem[] {
  const seen = new Set<string>();

  const file: OpenItem[] = [];

  for (const entry of entries) {
    const title = normaliseTitle(entry.title);

    if (!openByTitle.has(title) && !seen.has(title)) {
      file.push(entry);
    }

    seen.add(title);
  }

  return file;
}
