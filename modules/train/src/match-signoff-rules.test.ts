import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { matchSignoffRules } from './match-signoff-rules.ts';

function setupTest() {
  return {
    head: brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290'),
    pullRequest: { repo: brandSchemas.repoName.parse('acme/skills'), number: 40 },
    skills: {
      name: 'skills',
      paths: ['**/SKILL.md', '**/skills/*/references/**'],
      repos: null,
    },
  };
}

test('it matches nothing when the paths were not read', () => {
  const ctx = setupTest();

  expect(matchSignoffRules([ctx.skills], ctx.pullRequest, { kind: 'not-read' })).toStrictEqual({
    rules: [],
    paths: [],
  });
});

test('it matches a path under a dot folder', () => {
  const ctx = setupTest();

  const changed = {
    kind: 'read',
    head: ctx.head,
    paths: ['.agents/skills/testing/SKILL.md', 'README.md'],
  } as const;

  expect(matchSignoffRules([ctx.skills], ctx.pullRequest, changed)).toStrictEqual({
    rules: ['skills'],
    paths: ['.agents/skills/testing/SKILL.md'],
  });
});

test('it matches a path at the repo root', () => {
  const ctx = setupTest();
  const changed = { kind: 'read', head: ctx.head, paths: ['SKILL.md'] } as const;

  expect(matchSignoffRules([ctx.skills], ctx.pullRequest, changed).rules).toStrictEqual(['skills']);
});

test('it matches case-sensitively', () => {
  const ctx = setupTest();
  const changed = { kind: 'read', head: ctx.head, paths: ['testing/skill.md'] } as const;

  expect(matchSignoffRules([ctx.skills], ctx.pullRequest, changed).rules).toStrictEqual([]);
});

test.each([
  ['the old path of a rename', ['testing/SKILL.md', 'docs/testing.md']],
  ['the new path of a rename', ['docs/testing.md', 'testing/SKILL.md']],
])('it counts %s when the list gives both', (_title, paths) => {
  const ctx = setupTest();
  const changed = { kind: 'read', head: ctx.head, paths } as const;

  expect(matchSignoffRules([ctx.skills], ctx.pullRequest, changed)).toStrictEqual({
    rules: ['skills'],
    paths: ['testing/SKILL.md'],
  });
});

test('it skips a rule whose repos leave out the pull request repo', () => {
  const ctx = setupTest();
  const rule = { ...ctx.skills, repos: [brandSchemas.repoName.parse('acme/other')] };
  const changed = { kind: 'read', head: ctx.head, paths: ['SKILL.md'] } as const;

  expect(matchSignoffRules([rule], ctx.pullRequest, changed).rules).toStrictEqual([]);
});

test('it matches a rule whose repos list the pull request repo', () => {
  const ctx = setupTest();
  const rule = { ...ctx.skills, repos: [ctx.pullRequest.repo] };
  const changed = { kind: 'read', head: ctx.head, paths: ['SKILL.md'] } as const;

  expect(matchSignoffRules([rule], ctx.pullRequest, changed).rules).toStrictEqual(['skills']);
});

test('it names each matching rule and joins their paths in the order given', () => {
  const ctx = setupTest();
  const docs = { name: 'docs', paths: ['docs/**'], repos: null };

  const changed = {
    kind: 'truncated',
    head: ctx.head,
    paths: ['docs/a.md', 'x/SKILL.md', 'src/b.ts'],
  } as const;

  expect(matchSignoffRules([ctx.skills, docs], ctx.pullRequest, changed)).toStrictEqual({
    rules: ['skills', 'docs'],
    paths: ['docs/a.md', 'x/SKILL.md'],
  });
});

test('it reads a backslash as part of a name, as on every host', () => {
  const ctx = setupTest();
  const rule = { name: 'docs', paths: ['skills/*'], repos: null };

  const changed = {
    kind: 'read',
    head: ctx.head,
    paths: [String.raw`skills/a\b.md`],
  } as const;

  expect(matchSignoffRules([rule], ctx.pullRequest, changed)).toStrictEqual({
    rules: ['docs'],
    paths: [String.raw`skills/a\b.md`],
  });
});
