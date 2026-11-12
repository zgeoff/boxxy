import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { loadJobRules } from './load-job-rules.ts';

test('it loads a merge step after review on the merge worker, with the jobs limit', () => {
  const rules = loadJobRules(() => ({ kind: 'wait', reason: 'checks pending', pending: [] }));
  const merge = brandSchemas.phaseName.parse('merge');

  const loaded: unknown = {
    worker: rules.phases.get(merge)?.worker,
    steps: rules.kinds
      .get(brandSchemas.itemKindName.parse('core.issue'))
      ?.pipeline.steps.map((step) => step.phase),
    limits: rules.limits.map((limit) => [limit.name, limit.counts]),
  };

  expect(loaded).toStrictEqual({
    worker: 'merge.forge',
    steps: ['triage', 'design', 'build', 'review', 'merge'],
    limits: [
      ['workers', { phase: ['triage', 'design', 'build', 'review'] }],
      ['jobs', { phase: ['merge'] }],
      ['owner-design', { phase: ['design'], designMode: ['attended'] }],
    ],
  });
});
