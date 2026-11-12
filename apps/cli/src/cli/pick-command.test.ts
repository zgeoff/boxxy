import { expect, test } from 'bun:test';
import { allCommands } from '../commands/all-commands.ts';
import { pickCommand } from './pick-command.ts';

test('it picks the command that the line starts with and leaves the rest as its words', () => {
  const picked = pickCommand(allCommands, ['item', 'close', 'i-1', '--reason', 'done']);

  expect(picked.kind === 'command' && [picked.command.procedure, picked.words]).toStrictEqual([
    'item.close',
    ['i-1', '--reason', 'done'],
  ]);
});

test('it picks a command of one word', () => {
  const picked = pickCommand(allCommands, ['defer', 'i-1']);

  expect(picked.kind === 'command' && picked.command.procedure).toBe('plan.defer');
});

test.each([[[]], [['help']], [['--help']], [['-h']]])('it asks for help for %p', (argv) => {
  expect(pickCommand(allCommands, argv)).toStrictEqual({ kind: 'help', prefix: [] });
});

test('it asks for the version for --version', () => {
  expect(pickCommand(allCommands, ['--version'])).toStrictEqual({ kind: 'version' });
});

test('it asks for the help of a group when the line names only the group', () => {
  expect(pickCommand(allCommands, ['hook'])).toStrictEqual({ kind: 'help', prefix: ['hook'] });
});

test('it asks for the help of a command when --help follows its name', () => {
  expect(pickCommand(allCommands, ['item', 'file', '--help'])).toStrictEqual({
    kind: 'help',
    prefix: ['item', 'file'],
  });
});

test.each([[['i-1', '--text', 'help']], [['i-1', '--', '--help']]])(
  'it reads a help word in %p as a word of the command',
  (words) => {
    const picked = pickCommand(allCommands, ['item', 'note', ...words]);

    expect(picked.kind === 'command' && picked.words).toStrictEqual(words);
  },
);

test('it names the first word of a line that no command starts', () => {
  expect(pickCommand(allCommands, ['item', 'explode'])).toStrictEqual({
    kind: 'unknown',
    word: 'item',
  });
});
