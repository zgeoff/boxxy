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

// A checked row is stored with `ref` as `<name>@<head>`, because the table's UNIQUE(attempt, kind,
// ref) cannot change without a table rebuild, and the same check at a new head is a new row. Only
// `parseStoreRow` strips the head again: raw SQL on the table sees the qualified ref.
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
