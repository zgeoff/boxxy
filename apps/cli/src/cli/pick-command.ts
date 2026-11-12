import type { Command } from '../types.ts';

export type PickedCommand =
  | { readonly kind: 'command'; readonly command: Command; readonly words: readonly string[] }

  // the words name no command, or ask for help; `prefix` is the part that names a group
  | { readonly kind: 'help'; readonly prefix: readonly string[] }
  | { readonly kind: 'version' }
  | { readonly kind: 'unknown'; readonly word: string };

const helpWords = new Set(['help', '--help', '-h']);

const versionWord = '--version';

// Finds the command that the command line starts with. The rest of the line is its flags and
// words.
export function pickCommand(commands: readonly Command[], argv: readonly string[]): PickedCommand {
  const [first] = argv;

  if (first === undefined || helpWords.has(first)) {
    return { kind: 'help', prefix: [] };
  }

  if (first === versionWord) {
    return { kind: 'version' };
  }

  const command = commands.find((candidate) =>
    candidate.path.every((word, index) => argv[index] === word),
  );

  if (command === undefined) {
    return pickGroup(commands, argv);
  }

  const words = argv.slice(command.path.length);

  return words.some((word) => helpWords.has(word))
    ? { kind: 'help', prefix: command.path }
    : { kind: 'command', command, words };
}

function pickGroup(commands: readonly Command[], argv: readonly string[]): PickedCommand {
  const prefix = argv.filter((word) => !helpWords.has(word));

  const isGroup = commands.some((candidate) =>
    prefix.every((word, index) => candidate.path[index] === word),
  );

  return isGroup ? { kind: 'help', prefix } : { kind: 'unknown', word: argv[0] ?? '' };
}
