import { ForTag, TypeGuards, Value, toValueSync } from 'liquidjs';
import type { Filter, Template, ValueToken } from 'liquidjs';
import { promptPlaceholders } from './constants.ts';
import { promptEngine } from './prompt-engine.ts';

const known: ReadonlySet<string> = new Set(promptPlaceholders);

// Why the template cannot render, or null when it can: a syntax error, a tag or filter the engine
// does not have, a name that is no placeholder or is read from a value, a for loop over anything
// but a bare placeholder, a range, or a field read on any value.
export function findPromptTemplateFault(template: string): string | null {
  const parsed = parseTemplate(template);

  if (typeof parsed === 'string') {
    return parsed;
  }

  const templates = collectTemplates(parsed);

  // Liquid reads `[title]` as the variable whose name is the value of `title`. Its static analysis
  // reports that read as `title`, so the check walks the tokens itself.
  const tokens = templates
    .flatMap((item) => (item.arguments ? [...item.arguments()] : []))
    .flatMap((argument) => collectValueTokens(argument))
    .flatMap((token) => collectNestedTokens(token));

  if (tokens.some((token) => isNameFromValue(token))) {
    return 'the template reads a variable whose name is a value, such as [title]; write the name out, as {{ title }}';
  }

  const unknown = [
    ...new Set(
      promptEngine.globalVariableSegmentsSync(parsed).map((segments) => String(segments[0])),
    ),
  ].filter((name) => !known.has(name));

  if (unknown.length > 0) {
    return `the template names ${formatNames(unknown)}, which is not a placeholder; the placeholders are ${promptPlaceholders.join(', ')}`;
  }

  const loops = templates.filter((item) => item instanceof ForTag);

  // The for tag keeps its own `forloop` object under that name, and a loop variable of the same
  // name replaces it, so the tag throws on its next turn.
  if (loops.some((loop) => loop.variable === 'forloop')) {
    return 'the template names a loop variable "forloop", which the for tag uses itself';
  }

  // The for tag drops the filters after its list without running them.
  if (loops.some((loop) => loop.token.args.includes('|'))) {
    return 'the template filters the list of a for loop, which the for tag ignores';
  }

  const collections = loops
    .map((loop) => loop.collection)
    .filter((collection) => !isBareName(collection));

  if (collections.length > 0) {
    return `the template loops over ${formatNames(collections.map((collection) => collection.getText()))}, but a for loop loops only over a placeholder`;
  }

  // Liquid builds a range as a list in memory, so `(1..10000000000)` runs out of memory at claim.
  if (tokens.some((token) => TypeGuards.isRangeToken(token))) {
    return 'the template builds a range, such as (1..3), which a prompt has no use for';
  }

  // Under `strictVariables` a missing field throws. Each value is a string, and a loop over a
  // string yields that string, so no field is safe to read.
  const fields = promptEngine
    .variableSegmentsSync(parsed)
    .filter((segments) => segments.length > 1);

  if (fields.length > 0) {
    return `the template reads ${formatNames(fields.map((segments) => segments.join('.')))}, but each value is plain text with no fields`;
  }

  return null;
}

function parseTemplate(template: string): Template[] | string {
  try {
    return promptEngine.parse(template);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return `the template does not parse: ${message}`;
  }
}

function collectTemplates(templates: readonly Template[]): Template[] {
  return templates.flatMap((template) => {
    const children = template.children ? toValueSync(template.children(false, true)) : [];

    return [template, ...collectTemplates(children)];
  });
}

function collectValueTokens(argument: Value | ValueToken): ValueToken[] {
  if (!(argument instanceof Value)) {
    return [argument];
  }

  return [
    ...argument.initial.postfix.filter((token) => TypeGuards.isValueToken(token)),
    ...argument.filters.flatMap((filter) => filter.args.flatMap((arg) => toArgTokens(arg))),
  ];
}

function toArgTokens(arg: Filter['args'][number]): ValueToken[] {
  if (!Array.isArray(arg)) {
    return [arg];
  }

  return arg[1] ? [arg[1]] : [];
}

function collectNestedTokens(token: ValueToken): ValueToken[] {
  const children: ValueToken[] = [];

  if (TypeGuards.isRangeToken(token)) {
    children.push(token.lhs, token.rhs);
  } else if (TypeGuards.isFilteredValueToken(token)) {
    children.push(
      ...token.initial.postfix.filter((item) => TypeGuards.isValueToken(item)),
      ...token.filters.flatMap((filter) => filter.args.flatMap((arg) => toArgTokens(arg))),
    );
  } else if (TypeGuards.isPropertyAccessToken(token)) {
    children.push(...token.props.filter((prop) => TypeGuards.isPropertyAccessToken(prop)));
  }

  return [token, ...children.flatMap((child) => collectNestedTokens(child))];
}

function isNameFromValue(token: ValueToken): boolean {
  return (
    TypeGuards.isPropertyAccessToken(token) && TypeGuards.isPropertyAccessToken(token.props[0])
  );
}

function formatNames(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(', ');
}

function isBareName(collection: ForTag['collection']): boolean {
  return (
    TypeGuards.isPropertyAccessToken(collection) &&
    collection.variable === undefined &&
    collection.props.length === 1 &&
    TypeGuards.isWordToken(collection.props[0])
  );
}
