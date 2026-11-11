import { expect, test } from 'bun:test';
import { isFolderTrusted } from './is-folder-trusted.ts';

test.each([
  ['/tmp/boxxy-test/repos', true],
  ['/tmp/boxxy-test/repos/', true],
  ['/tmp/boxxy-test/repos/widget', true],
  ['/tmp/boxxy-test/repos-old/widget', false],
  ['/tmp/boxxy-test', false],
])('it reads the folder %s as trusted: %s', (folder, expected) => {
  expect(isFolderTrusted(['/tmp/boxxy-test/repos/'], folder)).toBe(expected);
});

test('it trusts no folder when the target lists none', () => {
  expect(isFolderTrusted([], '/tmp/boxxy-test/repos')).toBe(false);
});

test('it never trusts every folder through a listed root folder', () => {
  expect(isFolderTrusted(['/'], '/tmp/boxxy-test/repos')).toBe(false);
});
