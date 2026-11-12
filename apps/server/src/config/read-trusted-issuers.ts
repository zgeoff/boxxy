import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export type IssuersAnswer =
  | { readonly kind: 'read'; readonly issuers: readonly unknown[] }
  | { readonly kind: 'invalid'; readonly message: string };

// The trust documents, one per regular file of each folder, as parsed JSON in name order. The
// adapter checks their shape; this reads them only. Folders that hold no document refuse, so a
// configured but empty mount never starts a server that refuses every session in silence.
export async function readTrustedIssuers(folders: readonly string[]): Promise<IssuersAnswer> {
  const issuers: unknown[] = [];

  for (const folder of folders) {
    const names = await readEntryNames(folder);

    if (names === null) {
      return { kind: 'invalid', message: `no trusted issuers folder at ${folder}` };
    }

    for (const name of names) {
      const file = path.join(folder, name);

      const entry = await readEntryKind(file);

      if (entry === 'missing') {
        return { kind: 'invalid', message: `the trust document at ${file} points nowhere` };
      }

      if (entry === 'other') {
        continue;
      }

      const text = await Bun.file(file).text();

      const json = parseJSON(text);

      if (json === undefined) {
        return { kind: 'invalid', message: `the trust document at ${file} is not JSON` };
      }

      issuers.push(json);
    }
  }

  if (issuers.length === 0) {
    return { kind: 'invalid', message: `no trust document in ${folders.join(', ')}` };
  }

  return { kind: 'read', issuers };
}

// null: the folder does not exist. A Kubernetes volume keeps its real files under `..data` and
// `..<timestamp>` and shows each key as a symlink beside them, so `..` names are skipped.
async function readEntryNames(folder: string): Promise<string[] | null> {
  try {
    const names = await readdir(folder);

    return names
      .filter((name) => !name.startsWith('..'))
      .toSorted((left, right) => left.localeCompare(right));
  } catch {
    return null;
  }
}

// `stat` follows a symlink to its target; a symlink that points nowhere is `missing`
async function readEntryKind(file: string): Promise<'file' | 'other' | 'missing'> {
  try {
    const stats = await stat(file);

    return stats.isFile() ? 'file' : 'other';
  } catch {
    return 'missing';
  }
}

function parseJSON(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);

    return value;
  } catch {
    return undefined;
  }
}
