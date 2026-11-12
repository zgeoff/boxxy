import { Liquid } from 'liquidjs';
import { promptFilters, promptTags } from './constants.ts';

// An empty `templates` map keeps Liquid off the file system. `jsTruthy` makes the empty string
// false, as Liquid's own truthiness counts only nil and false as false. No `outputEscape`: a
// prompt is plain text, so a value reaches the agent as written.
export const promptEngine = new Liquid({
  templates: {},
  jsTruthy: true,
  strictVariables: true,
  strictFilters: true,
});

const tags: ReadonlySet<string> = new Set(promptTags);
const filters: ReadonlySet<string> = new Set(promptFilters);

for (const tag of Object.keys(promptEngine.tags).filter((name) => !tags.has(name))) {
  Reflect.deleteProperty(promptEngine.tags, tag);
}

for (const filter of Object.keys(promptEngine.filters).filter((name) => !filters.has(name))) {
  Reflect.deleteProperty(promptEngine.filters, filter);
}
