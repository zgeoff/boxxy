import { expect, test } from 'bun:test';
import { parsePullRequestEvent } from './parse-pull-request-event.ts';

test('it reads the body, the branches and the author of a pull request event', () => {
  const text = JSON.stringify({
    action: 'edited',
    pull_request: {
      number: 7,
      body: '## Verification\n',
      base: { ref: 'main' },
      head: { ref: 'add-tray-view' },
      user: { type: 'User', login: 'tray-keeper' },
    },
  });

  expect(parsePullRequestEvent(text)).toStrictEqual({
    kind: 'parsed',
    body: '## Verification\n',
    baseRef: 'main',
    headRef: 'add-tray-view',
    author: { type: 'User', login: 'tray-keeper' },
  });
});

test('it reads a null body as an empty one', () => {
  const text = JSON.stringify({ pull_request: { body: null, base: { ref: 'main' } } });

  expect(parsePullRequestEvent(text)).toStrictEqual({
    kind: 'parsed',
    body: '',
    baseRef: 'main',
    headRef: '',
    author: null,
  });
});

test('it reads an event with no head branch or author as an empty branch and no author', () => {
  const text = JSON.stringify({ pull_request: { body: '', base: { ref: 'main' }, user: {} } });

  expect(parsePullRequestEvent(text)).toStrictEqual({
    kind: 'parsed',
    body: '',
    baseRef: 'main',
    headRef: '',
    author: null,
  });
});

test.each([
  ['text that is not JSON', 'not json'],
  ['a push event', JSON.stringify({ ref: 'refs/heads/main' })],
  ['an empty base branch', JSON.stringify({ pull_request: { body: '', base: { ref: '' } } })],
])('it refuses %s, which names no base branch', (_name, text) => {
  expect(parsePullRequestEvent(text)).toStrictEqual({
    kind: 'refused',
    message: 'the event holds no pull_request.base.ref',
  });
});

test('it refuses a body that is not text', () => {
  const text = JSON.stringify({ pull_request: { body: 7, base: { ref: 'main' } } });

  expect(parsePullRequestEvent(text)).toStrictEqual({
    kind: 'refused',
    message: 'the event holds no pull_request.body',
  });
});
