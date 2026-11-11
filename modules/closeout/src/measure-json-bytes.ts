import type { JsonValue } from '@boxxy/model';

const encoder = new TextEncoder();

// The UTF-8 bytes of the value's JSON, which is what a stored copy takes.
export function measureJsonBytes(value: JsonValue): number {
  return encoder.encode(JSON.stringify(value)).length;
}
