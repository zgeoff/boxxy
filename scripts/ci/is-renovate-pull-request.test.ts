import { expect, test } from 'bun:test';
import { isRenovatePullRequest } from './is-renovate-pull-request.ts';

test('it is true for the renovate bot on a renovate branch', () => {
  const pullRequest = {
    headRef: 'renovate/left-pad-2.x',
    author: { type: 'Bot', login: 'zgeoff-renovate[bot]' },
  };

  expect(isRenovatePullRequest(pullRequest)).toBe(true);
});

test.each([
  {
    who: 'a person on a renovate branch',
    headRef: 'renovate/left-pad-2.x',
    author: { type: 'User', login: 'tray-keeper' },
  },
  {
    who: 'a person whose login is the renovate bot login',
    headRef: 'renovate/left-pad-2.x',
    author: { type: 'User', login: 'zgeoff-renovate[bot]' },
  },
  {
    who: 'another bot on a renovate branch',
    headRef: 'renovate/left-pad-2.x',
    author: { type: 'Bot', login: 'other-bot[bot]' },
  },
  {
    who: 'the renovate bot on another branch',
    headRef: 'update-left-pad',
    author: { type: 'Bot', login: 'zgeoff-renovate[bot]' },
  },
  { who: 'an unknown author on a renovate branch', headRef: 'renovate/left-pad-2.x', author: null },
])('it is false for $who', (row) => {
  expect(isRenovatePullRequest({ headRef: row.headRef, author: row.author })).toBe(false);
});
