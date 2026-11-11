import { readdir } from 'node:fs/promises';
import path from 'node:path';

export type IssuersAnswer =
  | { readonly kind: 'read'; readonly issuers: readonly unknown[] }
  | { readonly kind: 'invalid'; readonly message: string };

// The trust documents, one per file of each folder, as parsed JSON in name order. The adapter
// checks their shape; this reads them only.
export async function readTrustedIssuers(folders: readonly string[]): Promise<IssuersAnswer> {
  const issuers: unknown[] = [];

  for (const folder of folders) {
    const files = await readFileNames(folder);

    if (files === null) {
      return { kind: 'invalid', message: `no trusted issuers folder at ${folder}` };
    }

    for (const name of files) {
      const file = path.join(folder, name);

      const text = await Bun.file(file).text();

      const json = parseJSON(text);

      if (json === undefined) {
        return { kind: 'invalid', message: `the trust document at ${file} is not JSON` };
      }

      issuers.push(json);
    }
  }

  return { kind: 'read', issuers };
}

// null: the folder does not exist
async function readFileNames(folder: string): Promise<string[] | null> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .toSorted((left, right) => left.localeCompare(right));
  } catch {
    return null;
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
