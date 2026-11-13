import { expect, test } from 'bun:test';
import { attemptCommands } from '../commands/attempt-commands.ts';
import { formatSessionGuide } from './format-session-guide.ts';

test('it names the phase and each outcome of the close-out', () => {
  const guide = formatSessionGuide({
    phase: 'triage',
    outcomes: ['accepted', 'duplicate', 'declined'],
  });

  expect(guide).toContain('attempt at the triage phase');
  expect(guide).toContain('with one of these outcomes: accepted, duplicate, declined.');
});

test('it names the five session commands', () => {
  const guide = formatSessionGuide({ phase: 'build', outcomes: ['built'] });

  const commands = new Set(guide.match(/boxxy attempt [a-z-]+/gu));

  expect([...commands]).toStrictEqual([
    'boxxy attempt current',
    'boxxy attempt list-items',
    'boxxy attempt show-item',
    'boxxy attempt evidence',
    'boxxy attempt close-out',
  ]);
});

test('it names only flags that the session commands take', () => {
  const guide = formatSessionGuide({ phase: 'build', outcomes: ['built'] });

  const flags = new Set(guide.match(/--[a-z-]+/gu));
  const options = new Set(attemptCommands.flatMap((command) => Object.keys(command.options)));

  expect([...flags]).toStrictEqual(['text', 'kind', 'ref', 'observed'].map((name) => `--${name}`));
  expect([...flags].map((flag) => flag.slice(2))).toSatisfyAll((name) => options.has(name));
});

test('it says that a session without a valid close-out fails', () => {
  const guide = formatSessionGuide({ phase: 'review', outcomes: ['passed'] });

  expect(guide).toEndWith('A session that ends without a valid close-out fails.');
});

test('it says the task is in the launch prompt and what attempt current gives', () => {
  const guide = formatSessionGuide({ phase: 'build', outcomes: ['built'] });

  expect(guide).toContain('Your whole task is in the launch prompt');

  expect(guide).toContain(
    '`boxxy attempt current` for the attempt ID and the JSON Schema of the close-out body',
  );
});

test('it says that the input is the input field of attempt current', () => {
  const guide = formatSessionGuide({ phase: 'build', outcomes: ['built'] });

  expect(guide).toContain(
    'Your input is the `input` field of the JSON that `boxxy attempt current` prints',
  );
});

test('it names the evidence kinds that the evidence command takes', () => {
  const guide = formatSessionGuide({ phase: 'build', outcomes: ['built'] });

  expect(guide).toContain('`boxxy attempt evidence --kind <test|ci-run|live-check> --ref');
});

test('it says what --ref takes, and that the close-out cites the evidence ID', () => {
  const guide = formatSessionGuide({ phase: 'build', outcomes: ['built'] });

  expect(guide).toContain(
    '`--ref` takes a test file and name, a CI run URL, or the command of a live check. `boxxy attempt close-out` takes no `--ref`: its body cites the ID that `boxxy attempt evidence` printed.',
  );
});

test('it names the evidence kind of a screenshot, a measurement and a diff', () => {
  const guide = formatSessionGuide({ phase: 'build', outcomes: ['built'] });

  expect(guide).toContain(
    'For a screenshot, use `live-check`, with the page or command in `--ref` and what it shows in `--observed`. For a measurement, use `live-check`, with the command in `--ref` and the number and its unit in `--observed`, or `test` when a test asserts it. A diff is no evidence kind: cite the test or check that shows what it changes.',
  );
});
