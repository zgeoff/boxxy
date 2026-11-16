import { expect, test } from 'bun:test';
import { buildSkillExcludeAddition } from './build-skill-exclude-addition.ts';

test.each([
  {
    file: 'an empty file',
    existing: '',
    prefix: '',
    names: ['alpha'],
    added: '/.claude/skills/alpha/\n',
  },
  {
    file: 'a file ending in a newline',
    existing: '# git\n',
    prefix: '',
    names: ['alpha'],
    added: '/.claude/skills/alpha/\n',
  },
  {
    file: 'a file with no final newline',
    existing: '# git',
    prefix: '',
    names: ['alpha'],
    added: '\n/.claude/skills/alpha/\n',
  },
  {
    file: 'a file that lists the skill',
    existing: '/.claude/skills/alpha/\n',
    prefix: '',
    names: ['alpha'],
    added: '',
  },
  {
    file: 'a file that lists one of two skills',
    existing: '/.claude/skills/alpha/\n',
    prefix: '',
    names: ['alpha', 'beta'],
    added: '/.claude/skills/beta/\n',
  },
  {
    file: 'a workspace in a subfolder',
    existing: '',
    prefix: 'app/',
    names: ['alpha'],
    added: '/app/.claude/skills/alpha/\n',
  },
])('it returns the lines to add for $file', (row) => {
  const addition = buildSkillExcludeAddition({
    existing: row.existing,
    prefix: row.prefix,
    names: row.names,
  });

  expect(addition).toBe(row.added);
});
