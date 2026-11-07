import type { TableName } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { tableCodecs } from './table-codecs.ts';
import { toColumnName } from './to-column-name.ts';

export type StoreValue = string | number | null;

// Each column of a partial row, with its value as SQLite stores it. A field outside the table's
// codec fails, so no caller's key reaches the SQL as a column name.
export function toStoreColumns(table: TableName, fields: object): [string, StoreValue][] {
  const codec = tableCodecs[table];

  const known = new Set<string>(codec.fields);
  const json = new Set<string>(codec.json);

  return Object.entries(fields).map(([field, value]: [string, unknown]) => {
    invariant(known.has(field), `${table} has no field ${field}`);

    return [toColumnName(field), toStoreValue(value, json.has(field))];
  });
}

function toStoreValue(value: unknown, isJSON: boolean): StoreValue {
  if (value === null) {
    return null;
  }

  if (isJSON) {
    return JSON.stringify(value);
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
