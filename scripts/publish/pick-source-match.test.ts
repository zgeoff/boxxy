import { expect, test } from 'bun:test';
import { pickSourceMatch } from './pick-source-match.ts';

test('it accepts a checkout at the commit that the release tag names', () => {
  const match = pickSourceMatch({
    tag: '@boxxy/cli@0.2.0',
    headSHA: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n',
    tagAnswerText: '{"sha":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"}',
  });

  expect(match).toStrictEqual({ kind: 'match' });
});

test('it refuses a checkout at another commit than the release tag', () => {
  const match = pickSourceMatch({
    tag: '@boxxy/cli@0.2.0',
    headSHA: 'ffffffffffffffffffffffffffffffffffffffff\n',
    tagAnswerText: '{"sha":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"}',
  });

  expect(match).toStrictEqual({
    kind: 'invalid',
    message:
      'the run checked out ffffffffffffffffffffffffffffffffffffffff, but @boxxy/cli@0.2.0 is a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2; dispatch the run at the release tag',
  });
});

test.each(['', 'not json', '{"sha":7}', '{}'])('it refuses a tag answer of %p', (tagAnswerText) => {
  const match = pickSourceMatch({
    tag: '@boxxy/cli@0.2.0',
    headSHA: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n',
    tagAnswerText,
  });

  expect(match).toStrictEqual({
    kind: 'invalid',
    message: 'GitHub gave no commit for @boxxy/cli@0.2.0',
  });
});
