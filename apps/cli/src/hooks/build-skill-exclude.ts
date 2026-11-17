import { workspaceSkillsFolder } from '../constants.ts';

export interface SkillExcludeInput {
  // the exclude file's text, empty when the file is absent
  readonly existing: string;

  // the workspace's path from the repository's top, as `git rev-parse --show-prefix` prints it
  readonly prefix: string;

  // the skills whose folders the file lists
  readonly add: readonly string[];
}

// Returns the exclude file's next text, which lists each added skill's folder once, by its path
// from the repository's top. It returns `existing` itself when nothing changes.
export function buildSkillExclude(input: SkillExcludeInput): string {
  const toLine = (name: string) => `/${escapeGlob(input.prefix)}${workspaceSkillsFolder}/${name}/`;
  const lines = input.existing === '' ? [] : input.existing.replace(/\n$/u, '').split('\n');

  const present = new Set(lines.map((line) => trimCarriageReturn(line)));

  const added = [...new Set(input.add.map(toLine))].filter((line) => !present.has(line));

  if (added.length === 0) {
    return input.existing;
  }

  return `${[...lines, ...added].join('\n')}\n`;
}

// git reads `*`, `?`, `[` and `\` in an exclude line as a pattern, so a folder named `a[1]` would
// match only `a1` without the backslash.
function escapeGlob(path: string): string {
  return path.replaceAll(/[\\*?[]/gu, String.raw`\$&`);
}

function trimCarriageReturn(line: string): string {
  return line.replace(/\r$/u, '');
}
