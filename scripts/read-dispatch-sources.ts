import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Every TypeScript file of modules/dispatch/src, by its path relative to that folder.
export function readDispatchSources(root: string): Map<string, string> {
  const source = join(root, 'modules/dispatch/src');
  const paths = [...new Bun.Glob('**/*.ts').scanSync({ cwd: source })];

  return new Map(paths.map((path) => [path, readFileSync(join(source, path), 'utf8')]));
}
