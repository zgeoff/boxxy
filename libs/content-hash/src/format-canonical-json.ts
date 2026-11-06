import type { JsonValue } from './json-value.ts';

// ts-pattern's match() fails the type check on the recursive JsonValue type ("instantiations of
// type 'InvertPatternInternal' appear infinitely circular"), so this branches with typeof
export function formatCanonicalJson(value: JsonValue): string {
  if (typeof value === 'number') {
    return formatCanonicalNumber(value);
  }

  // RFC 8785 writes literals and strings as ECMAScript's JSON.stringify does
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (isJsonList(value)) {
    return `[${value.map((item) => formatCanonicalJson(item)).join(',')}]`;
  }

  const members = Object.entries(value)
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, member]) => `${JSON.stringify(key)}:${formatCanonicalJson(member)}`);

  return `{${members.join(',')}}`;
}

function formatCanonicalNumber(number: number): string {
  if (!Number.isFinite(number)) {
    throw new TypeError(`RFC 8785 has no form for the number ${number}`);
  }

  // RFC 8785 writes a number as ECMAScript's Number serialization, which JSON.stringify uses
  return JSON.stringify(number);
}

function isJsonList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}
