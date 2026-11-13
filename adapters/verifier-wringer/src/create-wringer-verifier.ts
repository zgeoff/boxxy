import type { CommitSha, Verifier, VerifyReading } from '@boxxy/model';
import { parseReportBlock } from '@wringer/core';
import type { WringerVerifierOptions } from './types.ts';

// The `Verifier` port on wringer. The gate check in CI computes the fingerprint, which needs a
// checkout, so the verifier trusts the gate's conclusion and takes the features from the report.
export function createWringerVerifier(options: WringerVerifierOptions): Verifier {
  return {
    readAt: async (pullRequest, head) => {
      const checks = await options.forge.readChecks(pullRequest.repo, head);

      const gate = checks.get(options.gateCheck);

      // a cancelled or skipped gate run gave no verdict, the same as a run still going
      if (gate !== 'success' && gate !== 'failure') {
        return { status: 'not-covered', head };
      }

      const body = await options.forge.readPullRequestBody(pullRequest);

      return buildVerifyReading(head, gate, body);
    },
  };
}

function buildVerifyReading(
  head: CommitSha,
  gate: 'success' | 'failure',
  body: string,
): VerifyReading {
  const parsed = parseReportBlock(body);

  if (!parsed.ok) {
    return { status: 'incomplete', head, features: [] };
  }

  return {
    status: gate === 'success' ? 'verified' : 'incomplete',
    head,
    features: parsed.report.features.map((feature) => ({
      name: feature.name,
      status: feature.status,
    })),
  };
}
