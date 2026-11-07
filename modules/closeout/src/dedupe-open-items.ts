import type { ItemId, ItemView, OpenItem } from '@boxxy/model';
import { normaliseTitle } from './normalise-title.ts';

export function dedupeOpenItems(
  entries: readonly OpenItem[],
  open: readonly ItemView[],
): { readonly file: readonly OpenItem[]; readonly matched: readonly ItemId[] } {
  const openByTitle = collectOpenByTitle(open);
  const file = entries.filter((entry) => !openByTitle.has(normaliseTitle(entry.title)));
  const matched = entries.flatMap((entry) => openByTitle.get(normaliseTitle(entry.title)) ?? []);

  return { file, matched: [...new Set(matched)] };
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
