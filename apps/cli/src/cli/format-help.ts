import { access } from '@boxxy/contract';
import { envNames } from '../constants.ts';
import type { Command } from '../types.ts';

// The usage line and the summary of each command that starts with the prefix. The usage line is
// the one the contract's access table holds.
export function formatHelp(commands: readonly Command[], prefix: readonly string[]): string {
  const lines = commands
    .filter((command) => prefix.every((word, index) => command.path[index] === word))
    .map((command) => `${access[command.procedure].cli}\n    ${command.summary}`);

  return [
    'usage: boxxy <command> [flags]',
    '',
    ...lines,
    '',
    `${envNames.url} is the address of the boxxy server.`,
  ].join('\n');
}
