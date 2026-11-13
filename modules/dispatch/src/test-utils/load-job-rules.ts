import { createReviewPhase, merge, phaseKinds } from '@boxxy/closeout';
import type { DriveContext, JobStep, LoadedRules } from '@boxxy/model';
import { brandSchemas, definePhase, mergeCloseOutSchema, toJSONValue } from '@boxxy/model';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules, rulesFileName } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import invariant from 'tiny-invariant';
import { buildJobRulesText } from './build-job-rules-text.ts';
import { createFakeReviewGate } from './create-fake-review-gate.ts';

// The example rules with a `merge` step after review on `merge.forge`, and the review phase kind
// on a fake review gate. `workers` counts the session phases and `jobs` the merges. With a drive,
// the merge phase kind runs it in place of the merge rule.
export function loadJobRules(drive?: (ctx: DriveContext) => JobStep): LoadedRules {
  const example = buildExampleLoadInput();

  const text = new TextDecoder().decode(example.checkout.files.get(rulesFileName));
  const jobText = new TextEncoder().encode(buildJobRulesText(text));

  const loaded = loadRules({
    ...example,
    checkout: {
      ...example.checkout,
      files: new Map([...example.checkout.files, [rulesFileName, jobText]]),
    },
    workers: [...example.workers, brandSchemas.workerKindName.parse('merge.forge')],
    concepts,
    pins: conceptPins,
    phases: [
      ...phaseKinds.filter((phase) => phase.name !== merge.name),
      createReviewPhase(createFakeReviewGate()),
      drive === undefined ? merge : buildMergePhase(drive),
    ],
  });

  invariant(loaded.kind === 'loaded', `the job rules load: ${JSON.stringify(loaded)}`);

  return loaded.rules;
}

function buildMergePhase(drive: (ctx: DriveContext) => JobStep) {
  return definePhase({
    name: brandSchemas.phaseName.parse('merge'),
    version: 1,
    worker: brandSchemas.workerKindName.parse('merge.forge'),
    outcomes: ['merged', 'repair', 'stale', 'unverified', 'closed', 'stalled', 'refused'],
    needsAcceptance: false,
    input: () => toJSONValue({}),
    drive,
    closeOut: {
      parse: (raw) => {
        const parsed = mergeCloseOutSchema.safeParse(raw);

        return parsed.success
          ? { kind: 'valid', closeOut: parsed.data }
          : {
              kind: 'invalid',
              problems: [{ kind: 'schema', path: '', message: parsed.error.message }],
            };
      },
      jsonSchema: {},
    },
    settle: (input) => ({
      state: input.closeOut.outcome === 'merged' ? 'succeeded' : 'failed',
      failure: input.closeOut.outcome === 'merged' ? null : input.closeOut.outcome,
      outcome: input.closeOut.outcome,
      effects: [],
      frictionDropped: 0,
    }),
  });
}
