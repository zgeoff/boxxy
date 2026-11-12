import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import { loadServerRules } from './load-server-rules.ts';

test('it loads the example rules with the review phase on the atc worker from the checkout alone', () => {
  const loaded = loadServerRules(buildExampleLoadInput().checkout);

  const review =
    loaded.kind === 'loaded'
      ? loaded.rules.phases.get(brandSchemas.phaseName.parse('review'))
      : undefined;

  expect(review?.worker).toBe(brandSchemas.workerKindName.parse('atc.session'));
});
