import { expect, test } from 'bun:test';
import { findPromptTemplateFault } from './find-prompt-template-fault.ts';

test('it finds no fault in a template that uses only placeholders', () => {
  expect(
    findPromptTemplateFault(
      'Build it.\n\n# {{ title }}\n\n{{outcome}}\n\n{% if design %}## Design\n\n{{ design }}{% endif %}\n\n{{ input | strip }}',
    ),
  ).toBeNull();
});

test('it finds no fault in a name the template assigns itself', () => {
  expect(findPromptTemplateFault('{% assign who = title %}{{ who }}')).toBeNull();
});

test.each([
  ['an output', 'Fix {{ desgin }}.'],
  ['a branch that a render with every value would skip', '{% if design %}{{ notez }}{% endif %}'],
  ['a condition', '{% if finding %}x{% endif %}'],
])('it names an unknown placeholder in %s', (_, template) => {
  expect(findPromptTemplateFault(template)).toStartWith('the template names "');
});

test('it lists the placeholders when a name is unknown', () => {
  expect(findPromptTemplateFault('{{ owner }}')).toBe(
    'the template names "owner", which is not a placeholder; the placeholders are ticket, title, outcome, body, acceptance, design, findings, notes, repo, attempt_id, input',
  );
});

test.each([
  ['an output', '{{ design.text }}', 'the template reads "design.text"'],
  ['a condition', '{% if design.location %}x{% endif %}', 'the template reads "design.location"'],
  ['an index', '{{ title[0] }}', 'the template reads "title.0"'],
])('it reports a field read on a placeholder in %s', (_, template, start) => {
  expect(findPromptTemplateFault(template)).toBe(
    `${start}, but each placeholder is plain text with no fields`,
  );
});

test.each([
  ['an unclosed if', '{% if design %}## Design'],
  ['an unclosed output', 'Build {{ title'],
  ['an unknown tag', '{% frobnicate %}'],
  ['an unknown filter', '{{ title | shout }}'],
  ['an include', "{% include 'other' %}"],
  ['a render', "{% render 'other' %}"],
  ['a layout', "{% layout 'base' %}"],
])('it reports %s as a parse fault', (_, template) => {
  expect(findPromptTemplateFault(template)).toStartWith('the template does not parse: ');
});
