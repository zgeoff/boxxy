import { formatCanonicalJson } from '@boxxy/content-hash';
import { itemRefPattern, toJSONValue } from '@boxxy/model';
import type { TableName } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { tableCodecs } from './table-codecs.ts';
import { toColumnName } from './to-column-name.ts';

export type StoreValue = string | number | null;

// a field outside the table's codec fails, so no caller's key reaches the SQL as a column name
export function toStoreColumns(table: TableName, fields: object): [string, StoreValue][] {
  const codec = tableCodecs[table];

  const known = new Set<string>(codec.fields);
  const json = new Set<string>(codec.json);
  const refs = new Set<string>(codec.refs);

  const qualified = table === 'evidence' ? qualifyEvidenceRef(fields) : fields;

  return Object.entries(qualified).map(([field, value]: [string, unknown]) => {
    invariant(known.has(field), `${table} has no field ${field}`);

    if (refs.has(field)) {
      return [toColumnName(field), toRefNumber(value)];
    }

    return [toColumnName(field), toStoreValue(value, json.has(field))];
  });
}

// The table's unique key is the attempt, the kind and the ref, so a checked row holds its head in
// the stored ref too: the same check at a new head is a new row. The row's `ref` stays the bare
// name, which `parseStoreRow` restores from the head column.
const headSeparator = '@';

function qualifyEvidenceRef(fields: object): object {
  const entries: [string, unknown][] = Object.entries(fields);
  const head = entries.find(([field]) => field === 'head')?.[1];

  if (typeof head !== 'string') {
    return fields;
  }

  return Object.fromEntries(
    entries.map(([field, value]) =>
      field === 'ref' && typeof value === 'string'
        ? [field, `${value}${headSeparator}${head}`]
        : [field, value],
    ),
  );
}

function toRefNumber(value: unknown): number {
  invariant(typeof value === 'string' && itemRefPattern.test(value), 'a reference is `i-<n>`');

  return Number(value.slice(2));
}

function toStoreValue(value: unknown, isJSON: boolean): StoreValue {
  if (value === null) {
    return null;
  }

  if (isJSON) {
    // an update compares the stored text, so two objects with their keys in another order match
    return formatCanonicalJson(toJSONValue(value));
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  invariant(
    typeof value === 'string' || typeof value === 'number',
    `a ${typeof value} needs a JSON column`,
  );

  return value;
}
