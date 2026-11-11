import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockEvidenceRow } from '@boxxy/model/test-utils/build-mock-evidence-row';
import { buildMockItemView } from '@boxxy/model/test-utils/build-mock-item-view';
import { missingCriteria } from './missing-criteria.ts';

test('it returns each criterion the close-out cites no evidence for', () => {
  const item = buildMockItemView({
    acceptance: [
      { id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] },
      { id: brandSchemas.criterionId.parse('a2'), text: 'Logs the retry', evidence: [] },
    ],
  });

  const row = buildMockEvidenceRow();

  const missing: unknown = missingCriteria(
    item,
    [row],
    [{ criterion: brandSchemas.criterionId.parse('a1'), evidence: row.factId }],
  );

  expect(missing).toStrictEqual(['a2']);
});

test('it counts a criterion as missing when its cited evidence is not among the rows', () => {
  const item = buildMockItemView({
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] }],
  });

  const cited = [
    {
      criterion: brandSchemas.criterionId.parse('a1'),
      evidence: brandSchemas.factId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a'),
    },
  ];

  const missing: unknown = missingCriteria(item, [buildMockEvidenceRow()], cited);

  expect(missing).toStrictEqual(['a1']);
});
