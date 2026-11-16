import type { DesignOpenItem } from '@boxxy/model';

// An open item with no key gets one from its position, which no given key can equal: a given key
// starts with a lowercase letter or a digit.
export function getOpenItemRef(openItem: DesignOpenItem, index: number): string {
  return openItem.key ?? `#${index}`;
}
