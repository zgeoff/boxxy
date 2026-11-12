import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { buildPromptValues } from './build-prompt-values.ts';
import { renderPrompt } from './render-prompt.ts';

test('it builds every placeholder from the item, the notes and the phase input', () => {
  const item = buildMockV1ItemView({
    title: 'Add a retry',
    outcome: 'A failed upload sends again.',
    body: '## Scope\n\nThe upload row only.',
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'It retries', evidence: [] }],
  });

  const values = buildPromptValues({
    item,
    attempt: 'att-1',
    notes: [
      {
        item: item.id,
        seq: 2,
        text: 'Second',
        by: 'boxxy:owner:local',
        at: brandSchemas.instant.parse(86_400_000),
      },
      {
        item: item.id,
        seq: 1,
        text: 'First',
        by: 'boxxy:owner:local',
        at: brandSchemas.instant.parse(0),
      },
    ],
    input: {
      design: { text: 'One button.\n\n```ts\nretry();\n```', location: 'docs/design/retry.md' },
      sentBack: {
        from: 'review',
        head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
        open: { high: 1, medium: 2, low: 0 },
        answerHint: 'Reply to each open finding.',
      },
    },
  });

  expect(values).toStrictEqual({
    title: 'Add a retry',
    outcome: 'A failed upload sends again.',
    body: '## Scope\n\nThe upload row only.',
    repo: item.repo,
    attempt_id: 'att-1',
    acceptance: '## Acceptance\n\n- a1: It retries',
    design: '## Design\n\nOne button.\n\n```ts\nretry();\n```\n\nLocation: docs/design/retry.md',
    findings:
      '## Findings to answer\n\nThe review at e83c5163316f89bfbde7d9ab23ca2e25604af290 left findings open: high 1, medium 2, low 0.\n\nReply to each open finding.',
    notes: '## Notes from the owner\n\n- 1970-01-01: First\n- 1970-01-02: Second',
    ticket: expect.stringMatching(/^# Add a retry\n\nA failed upload sends again\.\n\n## Scope/u),
    input: expect.any(String),
  });
});

test('it joins the ticket in order, with each section that has content', () => {
  const item = buildMockV1ItemView({
    title: 'Add a retry',
    outcome: 'Done.',
    body: 'Body.',
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'It retries', evidence: [] }],
  });

  const values = buildPromptValues({
    item,
    attempt: 'att-1',
    notes: [
      {
        item: item.id,
        seq: 1,
        text: 'A note',
        by: 'boxxy:owner:local',
        at: brandSchemas.instant.parse(0),
      },
    ],
    input: { design: { text: 'The design.', location: null } },
  });

  expect(values['ticket']).toBe(
    [
      '# Add a retry',
      'Done.',
      'Body.',
      '## Acceptance\n\n- a1: It retries',
      '## Design\n\nThe design.',
      '## Notes from the owner\n\n- 1970-01-01: A note',
    ].join('\n\n'),
  );
});

test('it renders each empty section as nothing', () => {
  const item = buildMockV1ItemView({ title: 'T', outcome: 'O', body: '', acceptance: [] });

  const values = buildPromptValues({
    item,
    attempt: 'att-1',
    notes: [],
    input: { acceptance: [] },
  });

  expect([
    values['body'],
    values['acceptance'],
    values['design'],
    values['findings'],
    values['notes'],
  ]).toStrictEqual(['', '', '', '', '']);

  expect(values['ticket']).toBe('# T\n\nO');
});

test('it leaves the text of the template outside the placeholders as it is', () => {
  const rendered = renderPrompt('Keep {{unknown}} and {{body}}.\n{{design}}\nEnd', {
    body: 'has {{title}} in it',
    design: '',
  });

  expect(rendered).toBe('Keep {{unknown}} and has {{title}} in it.\n\nEnd');
});
