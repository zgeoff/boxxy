import { expect, test } from 'bun:test';
import { getLaunchSections } from './get-launch-sections.ts';

test('it gives the design and the findings of a build input', () => {
  const input = {
    acceptance: [],
    design: { text: 'The design.', location: null },
    findings: [{ title: 'Runs twice', body: 'Fix it.', path: 'src/a.ts', line: 3 }],
    pullRequest: null,
  };

  expect(getLaunchSections(input)).toStrictEqual({
    design: input.design,
    findings: input.findings,
  });
});

test.each([
  ['a triage input', { acceptance: [] }],
  ['a build input with no design', { design: null, findings: [] }],
  ['an input of another shape', 'text'],
])('it gives no design and no findings for %s', (_title, input) => {
  expect(getLaunchSections(input)).toStrictEqual({ design: null, findings: [] });
});
