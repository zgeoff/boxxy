import { expect, test } from 'bun:test';
import { formatSessionGuide } from './format-session-guide.ts';

test('it names the phase and each outcome of the close-out', () => {
  const guide = formatSessionGuide({
    phase: 'triage',
    outcomes: ['accepted', 'duplicate', 'declined'],
  });

  expect(guide).toContain('attempt at the triage phase');
  expect(guide).toContain('with one of these outcomes: accepted, duplicate, declined.');
});

test('it names the three session commands', () => {
  const guide = formatSessionGuide({ phase: 'build', outcomes: ['built'] });
  const commands = guide.match(/boxxy attempt [a-z-]+/gu);

  expect(commands).toStrictEqual([
    'boxxy attempt current',
    'boxxy attempt evidence',
    'boxxy attempt close-out',
  ]);
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
