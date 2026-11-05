import { expect, test } from 'bun:test';
import { pickDistTagArgs } from './pick-dist-tag-args.ts';

test.each<readonly [string, string | null, string, readonly string[]]>([
  ['a package with no latest tag', null, '0.1.0', []],
  ['a version above latest', '0.1.0', '0.2.0', []],
  ['the latest version itself', '0.2.0', '0.2.0', []],
  ['a version below latest', '0.2.0', '0.1.1', ['--tag', 'backport']],
  ['a patch of an older minor', '1.0.0', '0.9.10', ['--tag', 'backport']],
])('it picks the dist-tag for %s', (_label, latestVersion, version, expected) => {
  expect(pickDistTagArgs(latestVersion, version)).toStrictEqual(expected);
});
