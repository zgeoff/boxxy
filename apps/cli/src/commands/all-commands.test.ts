import { expect, test } from 'bun:test';
import { access } from '@boxxy/contract';
import { allCommands } from './all-commands.ts';

test.each(Object.keys(access))('it has one command for the procedure %s', (procedure) => {
  const commands = allCommands.filter((command) => command.procedure === procedure);

  expect(commands).toHaveLength(1);
});

test('it gives every command its own words', () => {
  const words = allCommands.map((command) => command.path.join(' '));

  expect(new Set(words).size).toBe(words.length);
});

test('it gives no command words that start another command, so the order of the list picks none', () => {
  const paths = allCommands.map((command) => command.path);

  const shadowing = paths.filter((path) =>
    paths.some(
      (other) => other.length > path.length && path.every((word, index) => other[index] === word),
    ),
  );

  expect(shadowing).toStrictEqual([]);
});

test('it names each command the way the access table writes its usage', () => {
  const usages = allCommands.map((command) => ({
    words: `boxxy ${command.path.join(' ')}`,
    usage: access[command.procedure].cli,
  }));

  const matches = usages.map((row) => row.usage.startsWith(row.words));

  expect(matches).not.toContain(false);
});

test('it names each option of a command in the usage that the access table writes', () => {
  const missing = allCommands.flatMap((command) =>
    Object.keys(command.options)
      .filter((option) => !access[command.procedure].cli.includes(`--${option}`))
      .map((option) => `${command.path.join(' ')} --${option}`),
  );

  expect(missing).toStrictEqual([]);
});
