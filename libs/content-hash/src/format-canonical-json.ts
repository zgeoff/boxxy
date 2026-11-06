import type { JsonValue } from './json-value.ts';

// ts-pattern's match() fails the type check on the recursive JsonValue type ("instantiations of
// type 'InvertPatternInternal' appear infinitely circular"), so this branches with typeof
export function formatCanonicalJson(value: JsonValue): string {
  if (typeof value === 'number') {
    return formatCanonicalNumber(value);
  }

  if (typeof value === 'string') {
    return formatCanonicalString(value);
  }

  // RFC 8785 writes the literals as ECMAScript's JSON.stringify does
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (isJsonList(value)) {
    return formatCanonicalList(value);
  }

  const members = Object.entries(value)
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, member]) => `${formatCanonicalString(key)}:${formatCanonicalJson(member)}`);

  return `{${members.join(',')}}`;
}

function formatCanonicalNumber(number: number): string {
  if (!Number.isFinite(number)) {
    throw new TypeError(`RFC 8785 has no form for the number ${number}`);
  }

  // RFC 8785 writes a number as ECMAScript's Number serialization, which JSON.stringify uses
  return JSON.stringify(number);
}

function formatCanonicalString(text: string): string {
  // JSON.stringify escapes a lone surrogate, but RFC 8785 rejects a string that holds one
  if (!text.isWellFormed()) {
    throw new TypeError('RFC 8785 has no form for a string with a lone UTF-16 surrogate');
  }

  return JSON.stringify(text);
}

function isJsonList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function formatCanonicalList(list: readonly JsonValue[]): string {
  // map() skips the holes of a sparse array, which would write `[,]` or hash like a shorter list
  if (Object.keys(list).length !== list.length) {
    throw new TypeError('RFC 8785 has no form for a sparse array');
  }

  return `[${list.map((item) => formatCanonicalJson(item)).join(',')}]`;
}
