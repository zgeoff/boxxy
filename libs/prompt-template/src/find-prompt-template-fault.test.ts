import { expect, test } from 'bun:test';
import { promptFilters } from './constants.ts';
import { findPromptTemplateFault } from './find-prompt-template-fault.ts';
import { renderPromptTemplate } from './render-prompt-template.ts';

function setupTest() {
  return {
    canRender(template: string, value: string): boolean {
      try {
        renderPromptTemplate(template, {
          ticket: value,
          title: value,
          outcome: value,
          body: value,
          acceptance: value,
          design: value,
          findings: value,
          stopped: value,
          notes: value,
          security: value,
          repo: value,
          attempt_id: value,
          input: value,
        });

        return true;
      } catch {
        return false;
      }
    },
  };
}

test('it finds no fault in a template that uses only placeholders', () => {
  expect(
    findPromptTemplateFault(
      'Build it.\n\n# {{ title }}\n\n{{outcome}}\n\n{% if design %}## Design\n\n{{ design }}{% endif %}\n\n{{ input | strip }}',
    ),
  ).toBeNull();
});

test.each([
  ['assign', '{% if design %}{% assign who = title %}{% endif %}{{ who }}'],
  ['capture', '{% if design %}{% capture who %}{{ title }}{% endcapture %}{% endif %}{{ who }}'],
  ['increment', '{% if design %}{% increment count %}{% endif %}{{ count }}'],
  ['decrement', '{% if design %}{% decrement count %}{% endif %}{{ count }}'],
  ['cycle', "{% cycle 'a', 'b' %}"],
  ['tablerow', '{% tablerow line in body %}{{ line }}{% endtablerow %}'],
  ['liquid', '{% liquid\necho title %}'],
  ['echo', '{% echo title %}'],
  ['break', '{% if design %}{% break %}{% endif %}{{ title }}'],
  ['continue', '{% if design %}{% continue %}{% endif %}{{ title }}'],
])('it reports the %s tag as a parse fault', (_, template) => {
  expect(findPromptTemplateFault(template)).toStartWith('the template does not parse: ');
});

test.each([
  ['date', "{{ 'now' | date: '%Y-%m-%d' }}"],
  ['date_to_xmlschema', "{{ 'now' | date_to_xmlschema }}"],
  ['date_to_rfc822', "{{ 'now' | date_to_rfc822 }}"],
  ['date_to_string', "{{ 'now' | date_to_string }}"],
  ['date_to_long_string', "{{ 'now' | date_to_long_string }}"],
  ['sample', '{{ body | split: " " | sample }}'],
  ['where', "{{ body | split: ' ' | where: 'kind' }}"],
  ['where_exp', "{{ body | split: ' ' | where_exp: 'line', 'line.kind' }}"],
  ['append', '{{ title | append }}'],
  ['base64_decode', '{{ body | base64_decode }}'],
  ['url_decode', '{{ body | url_decode }}'],
  ['url_encode', '{{ body | url_encode }}'],
])('it reports the %s filter as a parse fault', (_, template) => {
  expect(findPromptTemplateFault(template)).toStartWith('the template does not parse: ');
});

test('it finds no fault in a for loop over a placeholder', () => {
  expect(
    findPromptTemplateFault('{% for line in body %}- {{ line | strip }}{% endfor %}'),
  ).toBeNull();
});

test.each([
  ['a range', '{% for n in (1..3) %}{{ n }}{% endfor %}', 'the template loops over "(1..3)"'],
  ['a quoted string', "{% for n in 'abc' %}{{ n }}{% endfor %}", `the template loops over "'abc'"`],
  [
    'a field',
    '{% for n in body.lines %}{{ n }}{% endfor %}',
    'the template loops over "body.lines"',
  ],
])('it reports a for loop over %s', (_, template, start) => {
  expect(findPromptTemplateFault(template)).toBe(
    `${start}, but a for loop loops only over a placeholder`,
  );
});

test.each([
  ['an output', '{{ [title] }}'],
  ['a condition', '{% if [title] %}x{% endif %}'],
])('it reports a variable whose name is a value in %s', (_, template) => {
  expect(findPromptTemplateFault(template)).toBe(
    'the template reads a variable whose name is a value, such as [title]; write the name out, as {{ title }}',
  );
});

test.each([
  ['date', '{% for line in body | date %}{{ line }}{% endfor %}'],
  ['split', '{% for line in body | split: "\n" %}{{ line }}{% endfor %}'],
])('it reports a for loop whose list has the %s filter', (_, template) => {
  expect(findPromptTemplateFault(template)).toBe(
    'the template filters the list of a for loop, which the for tag ignores',
  );
});

test.each([
  ['an output', '{{ (1..10000000000) | size }}'],
  ['a condition', '{% if (1..3) %}x{% endif %}'],
])('it reports a range in %s', (_, template) => {
  expect(findPromptTemplateFault(template)).toBe(
    'the template builds a range, such as (1..3), which a prompt has no use for',
  );
});

test('it reports a for loop whose variable is named forloop', () => {
  expect(findPromptTemplateFault('{% for forloop in body %}{{ forloop }}{% endfor %}')).toBe(
    'the template names a loop variable "forloop", which the for tag uses itself',
  );
});

test.each([
  ['the loop variable', '{% for line in body %}{{ line.text }}{% endfor %}', '"line.text"'],
  ['forloop', '{% for line in body %}{{ forloop.index }}{% endfor %}', '"forloop.index"'],
])('it reports a field read on %s', (_, template, read) => {
  expect(findPromptTemplateFault(template)).toBe(
    `the template reads ${read}, but each value is plain text with no fields`,
  );
});

test.each(promptFilters)('it finds a fault, or renders any text, for the %s filter', (filter) => {
  const values = ['', 'a b', '100%', '\uD800', '{"k": 1}', '-3.5', '<b>\n\t</b>'];

  const args = [
    '',
    ': "x"',
    ': 0',
    ': -1',
    ': 3, "x"',
    ': title',
    ': title, body',
    ': "x", 1, 2',
    ': nil',
    ': true',
    ': empty',
  ];

  const templates = args.flatMap((arg) => [
    `{{ title | ${filter}${arg} }}`,
    `{{ title | split: " " | ${filter}${arg} }}`,
  ]);

  const ctx = setupTest();

  const failures = templates
    .filter((template) => findPromptTemplateFault(template) === null)
    .flatMap((template) => values.map((value) => [template, value]))
    .filter(([template = '', value = '']) => !ctx.canRender(template, value));

  expect(failures).toStrictEqual([]);
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
    'the template names "owner", which is not a placeholder; the placeholders are ticket, title, outcome, body, acceptance, design, findings, stopped, notes, security, repo, attempt_id, input',
  );
});

test.each([
  ['an output', '{{ design.text }}', 'the template reads "design.text"'],
  ['a condition', '{% if design.location %}x{% endif %}', 'the template reads "design.location"'],
  ['an index', '{{ title[0] }}', 'the template reads "title.0"'],
])('it reports a field read on a placeholder in %s', (_, template, start) => {
  expect(findPromptTemplateFault(template)).toBe(
    `${start}, but each value is plain text with no fields`,
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
