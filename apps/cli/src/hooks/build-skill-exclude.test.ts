import { expect, test } from 'bun:test';
import { buildSkillExclude } from './build-skill-exclude.ts';

test.each([
  {
    file: 'an empty file',
    existing: '',
    prefix: '',
    add: ['alpha'],
    remove: [],
    next: '/.claude/skills/alpha/\n',
  },
  {
    file: 'a file ending in a newline',
    existing: '# git\n',
    prefix: '',
    add: ['alpha'],
    remove: [],
    next: '# git\n/.claude/skills/alpha/\n',
  },
  {
    file: 'a file with no final newline',
    existing: '# git',
    prefix: '',
    add: ['alpha'],
    remove: [],
    next: '# git\n/.claude/skills/alpha/\n',
  },
  {
    file: 'a file with CRLF line ends that lists the skill',
    existing: '# git\r\n/.claude/skills/alpha/\r\n',
    prefix: '',
    add: ['alpha'],
    remove: [],
    next: '# git\r\n/.claude/skills/alpha/\r\n',
  },
  {
    file: 'a file that lists one of two skills',
    existing: '/.claude/skills/alpha/\n',
    prefix: '',
    add: ['alpha', 'beta'],
    remove: [],
    next: '/.claude/skills/alpha/\n/.claude/skills/beta/\n',
  },
  {
    file: 'a skill named twice',
    existing: '',
    prefix: '',
    add: ['alpha', 'alpha'],
    remove: [],
    next: '/.claude/skills/alpha/\n',
  },
  {
    file: 'a skill the repository now commits',
    existing: '# git\n/.claude/skills/alpha/\n/.claude/skills/beta/\n',
    prefix: '',
    add: ['beta'],
    remove: ['alpha'],
    next: '# git\n/.claude/skills/beta/\n',
  },
  {
    file: 'a workspace in a subfolder',
    existing: '',
    prefix: 'app/',
    add: ['alpha'],
    remove: [],
    next: '/app/.claude/skills/alpha/\n',
  },
  {
    file: 'a subfolder with glob characters',
    existing: '',
    prefix: String.raw`a b[1]/c*d?\e/`,
    add: ['alpha'],
    remove: [],
    next: `${String.raw`/a b\[1]/c\*d\?\\e/.claude/skills/alpha/`}\n`,
  },
])('it returns the next exclude text for $file', (row) => {
  const next = buildSkillExclude({
    existing: row.existing,
    prefix: row.prefix,
    add: row.add,
    remove: row.remove,
  });

  expect(next).toBe(row.next);
});

test('it returns the text unchanged when it lists each added skill and no removed one', () => {
  const existing = '# git\n/.claude/skills/alpha/';
  const next = buildSkillExclude({ existing, prefix: '', add: ['alpha'], remove: ['beta'] });

  expect(next).toBe('# git\n/.claude/skills/alpha/');
});
