import type { ContentHash } from './content-hash-schema.ts';
import { formatCanonicalJson } from './format-canonical-json.ts';
import { hashBytes } from './hash-bytes.ts';
import type { JsonValue } from './json-value.ts';

export function contentHash(value: JsonValue): ContentHash {
  return hashBytes(new TextEncoder().encode(formatCanonicalJson(value)));
}
