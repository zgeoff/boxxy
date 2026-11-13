import type { ItemId, ItemKindName, ItemView, OpenItem } from '@boxxy/model';
import { normaliseTitle } from './normalise-title.ts';

// An entry matches an open item of its own kind whose title is equal after normalising.
export function dedupeOpenItems(
  entries: readonly OpenItem[],
  open: readonly ItemView[],
): { readonly file: readonly OpenItem[]; readonly matched: readonly ItemId[] } {
  const openByKey = collectOpenByKey(open);
  const matched = entries.flatMap((entry) => openByKey.get(toDedupeKey(entry)) ?? []);

  return { file: collectNewEntries(entries, openByKey), matched: [...new Set(matched)] };
}

function collectOpenByKey(open: readonly ItemView[]): Map<string, ItemId> {
  const openByKey = new Map<string, ItemId>();

  for (const item of open) {
    const key = toDedupeKey(item);

    if (!openByKey.has(key)) {
      openByKey.set(key, item.id);
    }
  }

  return openByKey;
}

interface Titled {
  readonly kind: ItemKindName;
  readonly title: string;
}

function toDedupeKey(entry: Titled): string {
  return JSON.stringify([entry.kind, normaliseTitle(entry.title)]);
}

function collectNewEntries(
  entries: readonly OpenItem[],
  openByKey: ReadonlyMap<string, ItemId>,
): OpenItem[] {
  const seen = new Set<string>();

  const file: OpenItem[] = [];

  for (const entry of entries) {
    const key = toDedupeKey(entry);

    if (!openByKey.has(key) && !seen.has(key)) {
      file.push(entry);
    }

    seen.add(key);
  }

  return file;
}
