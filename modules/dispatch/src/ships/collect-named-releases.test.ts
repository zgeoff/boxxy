import { expect, test } from 'bun:test';
import type { Release } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { collectNamedReleases } from './collect-named-releases.ts';

function setupTest() {
  const publishedAt = brandSchemas.instant.parse(1000);

  const buildRelease = (tag: string): Release => ({
    tag,
    url: `https://github.com/acme/lamps/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    publishedAt,
  });

  return { releases: [buildRelease('v1.0'), buildRelease('v1.0.1')] };
}

test.each([
  ['a URL alone', 'https://github.com/acme/lamps/releases/tag/v1.0', ['v1.0']],
  [
    'a URL that ends a sentence',
    'Bump to https://github.com/acme/lamps/releases/tag/v1.0.',
    ['v1.0'],
  ],
  ['a URL in a link', '[v1.0](https://github.com/acme/lamps/releases/tag/v1.0)', ['v1.0']],
  [
    'two URLs',
    'v1.0.1 https://github.com/acme/lamps/releases/tag/v1.0.1 and https://github.com/acme/lamps/releases/tag/v1.0\n',
    ['v1.0', 'v1.0.1'],
  ],
  [
    'a longer tag than the release',
    'https://github.com/acme/lamps/releases/tag/v1.0.1',
    ['v1.0.1'],
  ],
  ['a URL with a build suffix', 'https://github.com/acme/lamps/releases/tag/v1.0+patch', []],
  [
    'a URL with a dot and a dash after the tag',
    'https://github.com/acme/lamps/releases/tag/v1.0.-patch',
    [],
  ],
  [
    'a URL with a dot, a bracket and a dash after the tag',
    'https://github.com/acme/lamps/releases/tag/v1.0.)-patch',
    [],
  ],
  [
    'a link that ends a sentence',
    'See [v1.0](https://github.com/acme/lamps/releases/tag/v1.0).',
    ['v1.0'],
  ],
  [
    'a link followed by text',
    '[v1.0](https://github.com/acme/lamps/releases/tag/v1.0),then',
    ['v1.0'],
  ],
  ['a link to a longer tag', '[v1.0](https://github.com/acme/lamps/releases/tag/v1.0.)-patch)', []],
  [
    'a URL with a comma and a letter after the tag',
    'https://github.com/acme/lamps/releases/tag/v1.0,x',
    [],
  ],
  [
    'a URL followed by a full stop and a new line',
    'https://github.com/acme/lamps/releases/tag/v1.0.\nNext',
    ['v1.0'],
  ],
  ['a URL of another repo', 'https://github.com/acme/shades/releases/tag/v1.0', []],
  ['a URL glued to a word before it', 'xhttps://github.com/acme/lamps/releases/tag/v1.0', []],
  ['a URL after a list dash', '- https://github.com/acme/lamps/releases/tag/v1.0', ['v1.0']],
  ['text with no URL', 'Bump lamps to v1.0', []],
])('it finds the releases that a body with %s names', (_title, body, tags) => {
  const ctx = setupTest();
  const named = collectNamedReleases(body, ctx.releases).map((release) => release.tag);

  expect(named).toStrictEqual(tags);
});
