import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { renderPromptTemplate } from '@boxxy/prompt-template';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import { buildPromptValues } from './build-prompt-values.ts';

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
    acceptance: '- a1: It retries',
    design: 'One button.\n\n```ts\nretry();\n```\n\nLocation: docs/design/retry.md',
    findings:
      'The review at e83c5163316f89bfbde7d9ab23ca2e25604af290 left findings open: high 1, medium 2, low 0.\n\nReply to each open finding.',
    stopped: '',
    notes: '- 1970-01-01: First\n- 1970-01-02: Second',
    ticket: expect.stringMatching(/^# Add a retry\n\nA failed upload sends again\.\n\n## Scope/u),
    input: expect.any(String),
  });
});

test.each([
  [
    'the head it read',
    'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    'The verify at e83c5163316f89bfbde7d9ab23ca2e25604af290 failed these features:\n\n- upload-retry\n- upload-progress',
  ],
  ['no head', null, 'The verify failed these features:\n\n- upload-retry\n- upload-progress'],
])('it lists the failed features of a verify send-back, with %s', (_title, head, findings) => {
  const item = buildMockV1ItemView({ title: 'T', outcome: 'O', body: '', acceptance: [] });

  const values = buildPromptValues({
    item,
    attempt: 'att-1',
    notes: [],
    input: {
      design: null,
      sentBack: { from: 'verify', head, features: ['upload-retry', 'upload-progress'] },
    },
  });

  expect([values.findings, values.ticket]).toStrictEqual([
    findings,
    `# T\n\nO\n\n## Findings to answer\n\n${findings}`,
  ]);
});

test('it joins the ticket in order, with each section that has content under its heading', () => {
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

  expect(values.ticket).toBe(
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

test('it builds each empty section as the empty string', () => {
  const item = buildMockV1ItemView({ title: 'T', outcome: 'O', body: '', acceptance: [] });

  const values = buildPromptValues({
    item,
    attempt: 'att-1',
    notes: [],
    input: { acceptance: [] },
  });

  expect([
    values.body,
    values.acceptance,
    values.design,
    values.findings,
    values.stopped,
    values.notes,
  ]).toStrictEqual(['', '', '', '', '', '']);

  expect(values.ticket).toBe('# T\n\nO');
});

test('it gives the reason the last design stopped at, and puts it in the ticket before the notes', () => {
  const item = buildMockV1ItemView({ title: 'T', outcome: 'O', body: '', acceptance: [] });

  const values = buildPromptValues({
    item,
    attempt: 'att-1',
    notes: [
      {
        item: item.id,
        seq: 1,
        text: 'Dark.',
        by: 'boxxy:owner:local',
        at: brandSchemas.instant.parse(0),
      },
    ],
    input: { acceptance: [], stopped: 'Should the default be light or dark?' },
  });

  expect([values.stopped, values.ticket]).toStrictEqual([
    'Should the default be light or dark?',
    '# T\n\nO\n\n## Where the last attempt stopped\n\nShould the default be light or dark?\n\n## Notes from the owner\n\n- 1970-01-01: Dark.',
  ]);
});

test.each(['prompts/design-v1.md', 'prompts/design-attended-v1.md'])(
  'it renders the reason the last design stopped at in the example prompt %s',
  (path) => {
    const item = buildMockV1ItemView({ title: 'T', outcome: 'O', body: '', acceptance: [] });

    const values = buildPromptValues({
      item,
      attempt: 'att-1',
      notes: [],
      input: { acceptance: [], stopped: 'Should the default be light or dark?' },
    });

    const template = new TextDecoder().decode(buildExampleLoadInput().checkout.files.get(path));

    expect(renderPromptTemplate(template, values)).toContain(
      '# T\n\nO\n\n## Where the last attempt stopped\n\nShould the default be light or dark?\n\n',
    );
  },
);

test.each(['prompts/design-v1.md', 'prompts/design-attended-v1.md'])(
  'it renders the example prompt %s with no stopped section when no design stopped blocked',
  (path) => {
    const item = buildMockV1ItemView({ title: 'T', outcome: 'O', body: '', acceptance: [] });

    const values = buildPromptValues({
      item,
      attempt: 'att-1',
      notes: [],
      input: { acceptance: [], stopped: null },
    });

    const template = new TextDecoder().decode(buildExampleLoadInput().checkout.files.get(path));

    expect(renderPromptTemplate(template, values)).not.toContain('Where the last attempt stopped');
  },
);

test('it renders the example build prompt with no design and no findings sections', () => {
  const item = buildMockV1ItemView({
    title: 'Add a dark theme',
    outcome: 'The app follows the system theme.',
    body: '## Scope\n\nOnly the theme.',
    acceptance: [
      {
        id: brandSchemas.criterionId.parse('a1'),
        text: 'The theme follows the system',
        evidence: [],
      },
    ],
  });

  const values = buildPromptValues({ item, attempt: 'att-1', notes: [], input: { pr: null } });

  const template = new TextDecoder().decode(
    buildExampleLoadInput().checkout.files.get('prompts/build-v1.md'),
  );

  expect(renderPromptTemplate(template, values)).toStartWith(
    [
      'Build this item to its design and acceptance list, and open a pull request.',
      '# Add a dark theme',
      'The app follows the system theme.',
      '## Scope',
      'Only the theme.',
      '## Acceptance',
      '- a1: The theme follows the system',
      "The attempt's input, as JSON, names the pull request when one exists:",
      '{\n  "pr": null\n}',
      'Run the checks',
    ].join('\n\n'),
  );
});

test('it renders the example review prompt with the command of the review input', () => {
  const item = buildMockV1ItemView({
    title: 'Add a dark theme',
    outcome: 'The app follows the system theme.',
    acceptance: [],
  });

  const input = {
    pullRequest: { repo: 'example/widget', number: 7 },
    round: 1,
    cause: 'first',
    command: "bun -e 'review'",
  };

  const values = buildPromptValues({ item, attempt: 'att-1', notes: [], input });

  const template = new TextDecoder().decode(
    buildExampleLoadInput().checkout.files.get('prompts/review-run.md'),
  );

  expect(renderPromptTemplate(template, values)).toContain(
    [
      "The attempt's input, as JSON, holds the review round and the command to run:",
      JSON.stringify(input, null, 2),
      "In the folder the session starts in, run the input's `command` exactly as it is given.",
    ].join('\n\n'),
  );
});

test('it renders a body that holds Liquid markup as written', () => {
  const item = buildMockV1ItemView({
    title: 'Fix the {{ title }} tag',
    outcome: 'The tag renders.',
    body: 'The page shows {% if design %}raw{% endif %} and {{ notes }}.',
    acceptance: [],
  });

  const values = buildPromptValues({ item, attempt: 'att-1', notes: [], input: { pr: null } });

  const template = new TextDecoder().decode(
    buildExampleLoadInput().checkout.files.get('prompts/build-v1.md'),
  );

  expect(renderPromptTemplate(template, values)).toContain(
    '# Fix the {{ title }} tag\n\nThe tag renders.\n\nThe page shows {% if design %}raw{% endif %} and {{ notes }}.\n\nThe attempt',
  );
});
