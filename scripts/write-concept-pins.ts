// turbo boundaries refuses a root dependency on a module, so this tool imports planning by path
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { concepts } from '../modules/planning/src/index.ts';
import { collectConceptPins } from './collect-concept-pins.ts';
import { formatConceptPinsModule } from './format-concept-pins-module.ts';
import { readPlanningSources } from './read-planning-sources.ts';
import { runProgram } from './run-program.ts';

export function writeConceptPins(root: string): void {
  const path = join(root, 'modules/planning/src/generated/concept-pins.ts');
  const pins = collectConceptPins(concepts, readPlanningSources(root));

  writeFileSync(path, formatConceptPinsModule(pins));

  const formatted = runProgram([join(root, 'node_modules/.bin/oxfmt'), path], {
    cwd: root,
    env: process.env,
  });

  if (formatted.exitCode !== 0) {
    throw new Error(`oxfmt failed on ${path}: ${formatted.stderr.trim()}`);
  }
}

if (import.meta.main) {
  writeConceptPins(join(import.meta.dir, '..'));
}
