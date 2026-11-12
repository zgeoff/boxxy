import { Liquid } from 'liquidjs';

// An empty `templates` map keeps Liquid off the file system. `jsTruthy` makes the empty string
// false, as Liquid's own truthiness counts only nil and false as false. No `outputEscape`: a
// prompt is plain text, so a value reaches the agent as written.
export const promptEngine = new Liquid({
  templates: {},
  jsTruthy: true,
  strictVariables: true,
  strictFilters: true,
});

for (const tag of ['include', 'render', 'layout', 'block']) {
  Reflect.deleteProperty(promptEngine.tags, tag);
}
