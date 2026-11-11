import type { Filter } from '@boxxy/model';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';

// a filter in the rules file may give one value as a bare string; a loaded filter always holds a list
export function toFilter(filter: ParsedRulesFile['pools'][number]['takes']): Filter {
  return Object.fromEntries(
    Object.entries(filter).map(([field, value]) => [
      field,
      typeof value === 'string' ? [value] : value,
    ]),
  );
}
