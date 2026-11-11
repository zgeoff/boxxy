import type { JsonValue } from '@boxxy/model';

// the JSON type of the contract's `z.json()` fields, whose arrays and records are mutable
export type WireJSON = null | boolean | number | string | WireJSON[] | { [key: string]: WireJSON };

export function toWireJSON(value: JsonValue): WireJSON {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (isJsonArray(value)) {
    return value.map((entry) => toWireJSON(entry));
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toWireJSON(entry)]));
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}
