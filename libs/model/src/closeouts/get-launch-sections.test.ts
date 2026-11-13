import { expect, test } from 'bun:test';
import { getLaunchSections } from './get-launch-sections.ts';

test('it gives the design and the send-back of a build input', () => {
  const input = {
    acceptance: [],
    design: { text: 'The design.', location: null },
    sentBack: {
      from: 'review',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      open: { high: 1, medium: 2, low: 0 },
      answerHint: 'Reply to each open finding.',
    },
    pullRequest: null,
  };

  const sections: unknown = getLaunchSections(input);

  expect(sections).toStrictEqual({ design: input.design, sentBack: input.sentBack });
});

test.each([
  ['the head its review passed', 'e83c5163316f89bfbde7d9ab23ca2e25604af290'],
  ['no head', null],
])('it gives the send-back of a build input after a failed verify, with %s', (_title, head) => {
  const input = {
    acceptance: [],
    design: null,
    sentBack: { from: 'verify', head, features: ['upload-retry'] },
    pullRequest: null,
  };

  const sections: unknown = getLaunchSections(input);

  expect(sections).toStrictEqual({ design: null, sentBack: input.sentBack });
});

test('it gives the design of a v1 build input, which holds no send-back', () => {
  const input = { acceptance: [], design: { text: 'The design.', location: null } };

  expect(getLaunchSections(input)).toStrictEqual({ design: input.design, sentBack: null });
});

test.each([
  ['a triage input', { acceptance: [] }],
  ['a build input with no design', { design: null, sentBack: null }],
  ['an input of another shape', 'text'],
])('it gives no design and no send-back for %s', (_title, input) => {
  expect(getLaunchSections(input)).toStrictEqual({ design: null, sentBack: null });
});
