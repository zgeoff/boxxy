import { parseArgs } from 'node:util';
import type { Command, CommandArgs } from '../types.ts';
import { UsageError } from './usage-error.ts';

// Reads the words after the command's name through the command's option table. An unknown flag, a
// flag with no value or a missing word throws a usage error.
export function parseCommandArgs(command: Command, line: readonly string[]): CommandArgs {
  const parsed = parseLine(command, line);
  const values: Readonly<Record<string, unknown>> = parsed.values;
  const positionals = parsed.positionals;

  const readStrings = (name: string): string[] => {
    const value = values[name];

    if (typeof value === 'string') {
      return [value];
    }

    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry: unknown): entry is string => typeof entry === 'string');
  };

  const readString = (name: string): string | undefined => readStrings(name)[0];

  const readOneOf = <Choice extends string>(
    name: string,
    choices: readonly Choice[],
  ): Choice | undefined => {
    const value = readString(name);
    const choice = choices.find((candidate) => candidate === value);

    if (value !== undefined && choice === undefined) {
      throw new UsageError(`--${name} takes one of: ${choices.join(', ')}`);
    }

    return choice;
  };

  return {
    positional: (index, label) => positionals[index] ?? failMissingWord(label),
    positionalsFrom: (index, label) => {
      const rest = positionals.slice(index);

      return rest.length === 0 ? failMissingWord(label) : rest;
    },
    string: readString,
    requireString: (name) => readString(name) ?? failMissingFlag(name),
    strings: readStrings,
    integer: (name) => {
      const value = readString(name);

      if (value === undefined) {
        return value;
      }

      if (!/^\d+$/u.test(value)) {
        throw new UsageError(`--${name} takes a whole number`);
      }

      return Number(value);
    },
    flag: (name) => values[name] === true,
    oneOf: readOneOf,
    requireOneOf: (name, choices) => readOneOf(name, choices) ?? failMissingFlag(name),
  };
}

function parseLine(command: Command, line: readonly string[]) {
  try {
    return parseArgs({
      args: [...line],
      options: command.options,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new UsageError(message);
  }
}

function failMissingWord(label: string): never {
  throw new UsageError(`missing <${label}>`);
}

function failMissingFlag(name: string): never {
  throw new UsageError(`missing --${name}`);
}
