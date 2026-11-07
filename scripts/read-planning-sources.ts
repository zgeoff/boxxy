import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readPlanningSources(root: string): Map<string, Uint8Array> {
  const source = join(root, 'modules/planning/src');
  const paths = [...new Bun.Glob('**/*.ts').scanSync({ cwd: source })];

  return new Map(
    paths
      .filter((path) => !path.endsWith('.test.ts'))
      .map((path) => [path, readFileSync(join(source, path))]),
  );
}
