import { parseArgs } from 'node:util';
import { match } from 'ts-pattern';
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

  return isHelpRequest(command, words)
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

// A help word that is the value of a flag, such as `--text help`, is that flag's value.
function isHelpRequest(command: Command, words: readonly string[]): boolean {
  const tokens = parseArgs({
    args: [...words],
    options: command.options,
    allowPositionals: true,
    strict: false,
    tokens: true,
  }).tokens;

  const terminator = tokens.findIndex((token) => token.kind === 'option-terminator');
  const beforeTerminator = terminator === -1 ? tokens : tokens.slice(0, terminator);

  return beforeTerminator.some((token) =>
    match(token)
      .with({ kind: 'option' }, (option) => helpWords.has(option.rawName))
      .with({ kind: 'positional' }, (positional) => helpWords.has(positional.value))
      .with({ kind: 'option-terminator' }, () => false)
      .exhaustive(),
  );
}
