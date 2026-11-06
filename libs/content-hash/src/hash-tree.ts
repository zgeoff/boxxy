import type { ContentHash } from './content-hash-schema.ts';
import { contentHash } from './content-hash.ts';
import { hashBytes } from './hash-bytes.ts';

export interface TreeFile {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly executable: boolean;
}

export function hashTree(files: readonly TreeFile[]): ContentHash {
  const entries = files
    .map((file) => ({
      path: file.path,
      sha256: hashBytes(file.bytes),
      executable: file.executable,
    }))
    .toSorted((left, right) => compareUTF8(left.path, right.path));

  return contentHash(entries);
}

function compareUTF8(left: string, right: string): number {
  const encoder = new TextEncoder();

  return Buffer.compare(encoder.encode(left), encoder.encode(right));
}
