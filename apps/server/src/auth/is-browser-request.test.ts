import { expect, test } from 'bun:test';
import { isBrowserRequest } from './is-browser-request.ts';

test.each([
  ['no browser header', {}, false],
  ['an address typed by a person', { 'sec-fetch-site': 'none' }, false],
  ['an Origin header', { origin: 'https://stranger.example' }, true],
  ['a cross-site fetch', { 'sec-fetch-site': 'cross-site' }, true],
  ['a same-site fetch', { 'sec-fetch-site': 'same-site' }, true],
  ['a same-origin fetch', { 'sec-fetch-site': 'same-origin' }, true],
  ['an Origin header with a typed address', { origin: 'null', 'sec-fetch-site': 'none' }, true],
] as const)('it answers for %s', (_name, headers, expected) => {
  expect(isBrowserRequest(new Headers(headers))).toBe(expected);
});
