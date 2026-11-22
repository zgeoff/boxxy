import { brandSchemas } from '@boxxy/model';
import { renderReportComment } from '@wringer/core';
import { buildPullRequestRef } from './build-pull-request-ref.ts';
import { ControlConflictError } from './control-conflict-error.ts';
import type { VerifyHarness } from './types.ts';

// the head that the opened pull request gets, which the checks and the verify gate pass at
export const checkedHead = brandSchemas.commitSha.parse('5e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b');

// Gives the opened pull request a head whose check `pr / checks` and verify gate passed, and a
// report in its body that lists the feature `file-item`, as a repo that runs both on each push has.
export async function passPullRequestChecks(harness: VerifyHarness): Promise<{ head: string }> {
  const number = harness.openedPullRequest;

  if (number === null) {
    throw new ControlConflictError('no pull request is open: run open-pull-request first');
  }

  const forge = harness.server.forge;
  const target = buildPullRequestRef(number);

  const reading = await forge.readPullRequest(target.ref);

  if (reading === 'not-found') {
    throw new ControlConflictError('the opened pull request is not on the forge');
  }

  forge.seed({
    ...target,
    reading: {
      state: reading.state,
      mergedAt: reading.mergedAt,
      mergeCommit: reading.mergeCommit,
      commits: reading.commits,
      head: checkedHead,
    },
    body: [
      'Follow the system theme.',
      '',
      renderReportComment({
        version: 2,
        registry: 'boxxy-verify',
        base: 'origin/main',
        fingerprint: '0f1e2d3c4b5a69780f1e2d3c4b5a69780f1e2d3c',
        claims: [
          {
            feature: 'file-item',
            fingerprint: '0f1e2d3c4b5a69780f1e2d3c4b5a69780f1e2d3c',
            featureFingerprint: '0f1e2d3c4b5a69780f1e2d3c4b5a69780f1e2d3c',
            run: 'run-file-item-1',
            at: '2026-11-01T09:00:00Z',
            target: { name: 'local', evidence: 'local' },
            pin: { kind: 'local' },
            evidenceDigest: '0'.repeat(64),
            evidenceCount: 0,
          },
        ],
      }),
    ].join('\n'),
  });

  forge.seedChecks({
    repo: target.ref.repo,
    head: checkedHead,
    checks: { 'pr / checks': 'success', 'verify / gate': 'success' },
  });

  return { head: checkedHead };
}
