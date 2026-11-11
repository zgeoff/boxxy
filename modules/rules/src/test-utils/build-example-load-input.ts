import { contentHash } from '@boxxy/content-hash';
import type { Concept, ConceptName, ConceptPin } from '@boxxy/model';
import { defineGate, defineSignal } from '@boxxy/model';
import { z } from 'zod';
import buildPrompt from '../../example/prompts/build-v1.md' with { type: 'text' };
import designAttendedPrompt from '../../example/prompts/design-attended-v1.md' with { type: 'text' };
import designPrompt from '../../example/prompts/design-v1.md' with { type: 'text' };
import reviewPrompt from '../../example/prompts/review-v1.md' with { type: 'text' };
import triagePrompt from '../../example/prompts/triage-v1.md' with { type: 'text' };
import exampleRules from '../../example/rules.yaml' with { type: 'text' };

interface ExampleLoadInput {
  readonly checkout: {
    readonly commit: string;
    readonly files: ReadonlyMap<string, Uint8Array>;
  };
  readonly concepts: readonly Concept[];
  readonly pins: ReadonlyMap<ConceptName, ConceptPin>;
}

// The example rules file with its prompts, and stand-ins for the three concepts it pins. The
// caller adds the phase kinds.
export function buildExampleLoadInput(): ExampleLoadInput {
  const encoder = new TextEncoder();

  const prompts = [
    ['triage-v1', triagePrompt],
    ['design-v1', designPrompt],
    ['design-attended-v1', designAttendedPrompt],
    ['build-v1', buildPrompt],
    ['review-v1', reviewPrompt],
  ] as const;

  return {
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', encoder.encode(z.string().parse(exampleRules))],
        ...prompts.map(([name, text]): [string, Uint8Array] => [
          `prompts/${name}.md`,
          encoder.encode(z.string().parse(text)),
        ]),
      ]),
    },
    concepts: buildStandInConcepts(),
    pins: new Map<string, ConceptPin>([
      ['pool', { ref: 'pool@2', sourceHash: contentHash('pool source') }],
      ['defer', { ref: 'defer@1', sourceHash: contentHash('defer source') }],
      ['expedite', { ref: 'expedite@1', sourceHash: contentHash('expedite source') }],
    ]),
  };
}

function buildStandInConcepts(): Concept[] {
  return [
    {
      name: 'pool',
      version: 2,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
      filterFields: [
        { name: 'phase', value: () => null },
        { name: 'kind', value: () => null },
        { name: 'repo', value: () => null },
        { name: 'designMode', value: () => null },
      ],
    },
    {
      name: 'defer',
      version: 1,
      gates: [
        defineGate({ name: 'defer', liftable: true, params: z.object({}), hold: () => null }),
      ],
      waivers: [{ name: 'expedite-lifts-defer', lifts: 'defer', lift: () => null }],
      levers: ['plan.defer', 'plan.undefer'],
    },
    {
      name: 'expedite',
      version: 1,
      signals: [
        defineSignal({
          name: 'expedite',
          params: z.object({}),
          value: () => null,
          combine: (left, right) => Math.min(left, right),
        }),
      ],
      levers: ['plan.expedite', 'plan.unexpedite'],
    },
  ];
}
