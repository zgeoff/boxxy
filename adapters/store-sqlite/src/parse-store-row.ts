import { rowSchemas } from '@boxxy/model';
import type { TableName, Tables } from '@boxxy/model';
import { tableCodecs } from './table-codecs.ts';
import { toColumnName } from './to-column-name.ts';

export function parseStoreRow<T extends TableName>(table: T, record: object): Tables[T] {
  const codec = tableCodecs[table];

  const columns = new Map<string, unknown>(Object.entries(record));
  const json = new Set<string>(codec.json);
  const flags = new Set<string>(codec.flags);

  const fields = Object.fromEntries(
    codec.fields.map((field) => {
      const value = columns.get(toColumnName(field));

      return [field, parseStoreValue(value, json.has(field), flags.has(field))];
    }),
  );

  return rowSchemas[table].parse(fields);
}

function parseStoreValue(value: unknown, isJSON: boolean, isFlag: boolean): unknown {
  if (isJSON && typeof value === 'string') {
    const parsed: unknown = JSON.parse(value);

    return parsed;
  }

  if (isFlag) {
    return value === 1;
  }

  return value;
}
