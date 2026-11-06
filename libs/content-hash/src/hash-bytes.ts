import { createHash } from 'node:crypto';
import type { ContentHash } from './content-hash-schema.ts';
import { contentHashSchema } from './content-hash-schema.ts';

export function hashBytes(bytes: Uint8Array): ContentHash {
  return contentHashSchema.parse(createHash('sha256').update(bytes).digest('hex'));
}
