import { expect, test } from 'bun:test';
import { renderPromptTemplate } from './render-prompt-template.ts';

test('it writes each value in place of its name, with or without spaces in the braces', () => {
  expect(
    renderPromptTemplate('{{title}}: {{ outcome }}', {
      ticket: '',
      title: 'Add a retry',
      outcome: 'A failed upload sends again.',
      body: '',
      acceptance: '',
      design: '',
      findings: '',
      notes: '',
      repo: 'acme/app',
      attempt_id: 'att-1',
      input: '{}',
    }),
  ).toBe('Add a retry: A failed upload sends again.');
});

test.each([
  ['an empty section', '', 'Start\nEnd'],
  ['a section with content', 'One button.', 'Start\n## Design\n\nOne button.\nEnd'],
])('it renders an if block for %s', (_, design, expected) => {
  expect(
    renderPromptTemplate('Start\n{% if design %}## Design\n\n{{ design }}\n{% endif %}End', {
      ticket: '',
      title: 'T',
      outcome: 'O',
      body: '',
      acceptance: '',
      design,
      findings: '',
      notes: '',
      repo: 'acme/app',
      attempt_id: 'att-1',
      input: '{}',
    }),
  ).toBe(expected);
});

test('it writes a value that holds Liquid markup as text, never running it', () => {
  expect(
    renderPromptTemplate('{{ body }}', {
      ticket: '',
      title: 'T',
      outcome: 'O',
      body: 'Keep {{ title }} and {% if design %}this{% endif %} and {%- raw -%}.',
      acceptance: '',
      design: 'yes',
      findings: '',
      notes: '',
      repo: 'acme/app',
      attempt_id: 'att-1',
      input: '{}',
    }),
  ).toBe('Keep {{ title }} and {% if design %}this{% endif %} and {%- raw -%}.');
});

test('it writes a value with HTML characters unescaped', () => {
  expect(
    renderPromptTemplate('{{ body }}', {
      ticket: '',
      title: 'T',
      outcome: 'O',
      body: 'Use `a < b && c > "d"`.',
      acceptance: '',
      design: '',
      findings: '',
      notes: '',
      repo: 'acme/app',
      attempt_id: 'att-1',
      input: '{}',
    }),
  ).toBe('Use `a < b && c > "d"`.');
});
