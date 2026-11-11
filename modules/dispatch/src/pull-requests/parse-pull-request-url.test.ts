import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { parsePullRequestUrl } from './parse-pull-request-url.ts';

test.each([
  ['a plain address', 'https://github.com/acme/lamps/pull/12', 12],
  ['an address with a files tab', 'https://github.com/acme/lamps/pull/12/files', 12],
  ['an address with a query and a fragment', 'https://github.com/acme/lamps/pull/12?x=1#top', 12],
])('it reads the repo and number of %s', (_title, url, number) => {
  expect(parsePullRequestUrl(url)).toStrictEqual({
    repo: brandSchemas.repoName.parse('acme/lamps'),
    number,
  });
});

test.each([
  ['an issue address', 'https://github.com/acme/lamps/issues/12'],
  ['an address with no number', 'https://github.com/acme/lamps/pull/'],
  ['a number of zero', 'https://github.com/acme/lamps/pull/0'],
  ['an address that is not http', 'ftp://github.com/acme/lamps/pull/12'],
  ['text', 'not a url'],
])('it returns null for %s', (_title, url) => {
  expect(parsePullRequestUrl(url)).toBeNull();
});
