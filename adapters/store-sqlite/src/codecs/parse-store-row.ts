import { rowSchemas } from '@boxxy/model';
import type { TableName, Tables } from '@boxxy/model';
import { tableCodecs } from './table-codecs.ts';
import { toColumnName } from './to-column-name.ts';

export function parseStoreRow<T extends TableName>(table: T, record: object): Tables[T] {
  const codec = tableCodecs[table];

  const columns = new Map<string, unknown>(Object.entries(record));
  const json = new Set<string>(codec.json);
  const flags = new Set<string>(codec.flags);
  const refs = new Set<string>(codec.refs);

  const fields = Object.fromEntries(
    codec.fields.map((field) => {
      const value = columns.get(toColumnName(field));

      if (refs.has(field)) {
        return [field, typeof value === 'number' ? `i-${value}` : value];
      }

      return [field, parseStoreValue(value, json.has(field), flags.has(field))];
    }),
  );

  const row = table === 'evidence' ? stripEvidenceHead(fields) : fields;

  return rowSchemas[table].parse(row);
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

// the inverse of the ref a checked row is stored under
function stripEvidenceHead(fields: Record<string, unknown>): Record<string, unknown> {
  const head = fields['head'];
  const ref = fields['ref'];

  if (typeof head !== 'string' || typeof ref !== 'string') {
    return fields;
  }

  return { ...fields, ref: ref.slice(0, Math.max(0, ref.length - head.length - 1)) };
}
