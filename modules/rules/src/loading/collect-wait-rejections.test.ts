import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockWaitKind, loadWaitRules } from '../test-utils/load-wait-rules.ts';

function setupTest() {
  return {
    atc: brandSchemas.workerKindName.parse('atc.session'),
    forgeWorker: brandSchemas.workerKindName.parse('merge.forge'),
  };
}

test.each([
  {
    title: 'a wait with no skip edge',
    step: '    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, waits: [shipped], on: { verified: next } }',
    path: 'pipelines.standard[1]',
    reason: { kind: 'gate-without-skip', phase: 'verify' },
  },
  {
    title: 'an unknown wait kind',
    step: '    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, waits: [deployed], skip: next, on: { verified: next } }',
    path: 'pipelines.standard[1].waits[0]',
    reason: { kind: 'unknown-wait-kind', phase: 'verify', wait: 'deployed' },
  },
])('it rejects $title', (row) => {
  const loaded: unknown = loadWaitRules({ step: row.step });

  expect(loaded).toStrictEqual({
    kind: 'rejected',
    rejections: [{ file: 'rules.yaml', path: row.path, reason: row.reason }],
  });
});

test('it rejects a wait that comes after an outcome no earlier step has', () => {
  const ctx = setupTest();

  const loaded: unknown = loadWaitRules({
    waits: [buildMockWaitKind({ after: { outcome: 'merged' }, worker: ctx.forgeWorker })],
  });

  expect(loaded).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'pipelines.standard[1].waits[0]',
        reason: {
          kind: 'wait-without-outcome',
          phase: 'verify',
          wait: 'shipped',
          outcome: 'merged',
        },
      },
    ],
  });
});

test('it rejects a wait on a server that has not built the worker of the wait kind', () => {
  const ctx = setupTest();
  const loaded: unknown = loadWaitRules({ workers: [ctx.atc] });

  expect(loaded).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'pipelines.standard[1].waits[0]',
        reason: {
          kind: 'wait-without-worker',
          phase: 'verify',
          wait: 'shipped',
          worker: 'merge.forge',
        },
      },
    ],
  });
});

test('it accepts a wait on a server that registers no worker for it', () => {
  const ctx = setupTest();
  const loaded = loadWaitRules({ waits: [buildMockWaitKind()], workers: [ctx.atc] });

  expect(loaded.kind).toBe('loaded');
});
