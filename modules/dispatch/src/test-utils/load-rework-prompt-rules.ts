import { createReviewPhase, phaseKinds } from '@boxxy/closeout';
import type { LoadedRules } from '@boxxy/model';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules, rulesFileName } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import invariant from 'tiny-invariant';
import { createFakeReviewGate } from './create-fake-review-gate.ts';

export interface ReworkPromptRules {
  readonly rules: LoadedRules;

  // the text of each file of the checkout by its path, the rework prompt's included, as the
  // spawn settings of a server hold them
  readonly prompts: ReadonlyMap<string, string>;
}

const reworkPath = 'prompts/build-rework-v1.md';

// The example rules with `reworkPrompt: prompts/build-rework-v1.md` on the build recipe, and that
// file holding the given template.
export function loadReworkPromptRules(template: string): ReworkPromptRules {
  const example = buildExampleLoadInput();

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const text = decoder.decode(example.checkout.files.get(rulesFileName));
  const from = '    prompt: prompts/build-v1.md\n';

  invariant(text.includes(from), `the example rules hold ${from}`);

  const files = new Map([
    ...example.checkout.files,
    [rulesFileName, encoder.encode(text.replace(from, `${from}    reworkPrompt: ${reworkPath}\n`))],
    [reworkPath, encoder.encode(template)],
  ]);

  const loaded = loadRules({
    ...example,
    checkout: { ...example.checkout, files },
    concepts,
    pins: conceptPins,
    phases: [...phaseKinds, createReviewPhase(createFakeReviewGate())],
  });

  invariant(loaded.kind === 'loaded', `the rework prompt rules load: ${JSON.stringify(loaded)}`);

  return {
    rules: loaded.rules,
    prompts: new Map([...files].map(([path, bytes]) => [path, decoder.decode(bytes)])),
  };
}
