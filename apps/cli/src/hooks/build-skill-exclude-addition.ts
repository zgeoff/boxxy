import { workspaceSkillsFolder } from '../constants.ts';

export interface SkillExcludeAdditionInput {
  // the exclude file's text, empty when the file is absent
  readonly existing: string;

  // the workspace's path from the repository's top, as `git rev-parse --show-prefix` prints it
  readonly prefix: string;
  readonly names: readonly string[];
}

// Returns the text to append to the exclude file so that it lists each skill's folder once, or an
// empty text when it lists them all.
export function buildSkillExcludeAddition(input: SkillExcludeAdditionInput): string {
  const lines = new Set(input.existing.split('\n'));

  const added = input.names
    .map((name) => `/${input.prefix}${workspaceSkillsFolder}/${name}/`)
    .filter((line) => !lines.has(line));

  if (added.length === 0) {
    return '';
  }

  const separator = input.existing === '' || input.existing.endsWith('\n') ? '' : '\n';

  return `${separator}${added.join('\n')}\n`;
}
