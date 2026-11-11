import { expect, test } from 'bun:test';
import { pickPullRequestURL } from './pick-pull-request-url.ts';

test.each([
  {
    title: 'the Bash output object',
    payload: {
      tool_name: 'Bash',
      tool_input: { command: 'gh pr create --fill' },
      tool_response: { stdout: 'https://github.com/example/app/pull/7\n' },
    },
  },
  {
    title: 'a Bash output that is plain text',
    payload: {
      tool_name: 'Bash',
      tool_input: { command: 'cd app && gh pr create --fill' },
      tool_response: 'Creating pull request\nhttps://github.com/example/app/pull/7\n',
    },
  },
])('it picks the URL from $title', (row) => {
  expect(pickPullRequestURL(row.payload)).toBe('https://github.com/example/app/pull/7');
});

test('it picks the last URL when the output holds more than one', () => {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: 'gh pr create --fill' },
    tool_response: {
      stdout: 'see https://github.com/example/app/pull/3\nhttps://github.com/example/app/pull/8\n',
    },
  };

  expect(pickPullRequestURL(payload)).toBe('https://github.com/example/app/pull/8');
});

test.each([
  {
    title: 'a tool other than Bash',
    payload: {
      tool_name: 'Write',
      tool_input: {},
      tool_response: 'https://github.com/example/app/pull/7',
    },
  },
  {
    title: 'a Bash call that is not gh pr create',
    payload: {
      tool_name: 'Bash',
      tool_input: { command: 'gh pr view 7' },
      tool_response: { stdout: 'https://github.com/example/app/pull/7' },
    },
  },
  {
    title: 'a gh pr create call that printed no URL',
    payload: {
      tool_name: 'Bash',
      tool_input: { command: 'gh pr create --fill' },
      tool_response: { stdout: 'nothing to create' },
    },
  },
  { title: 'a call with no input', payload: { tool_name: 'Bash' } },
])('it picks nothing from $title', (row) => {
  expect(pickPullRequestURL(row.payload)).toBeNull();
});
