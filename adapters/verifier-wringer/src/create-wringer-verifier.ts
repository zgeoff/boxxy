import type { CheckReading, CommitSha, Verifier, VerifyReading } from '@boxxy/model';
import { parseReportBlock } from '@wringer/core';
import type { WringerVerifierOptions } from './types.ts';

// The `Verifier` port on wringer. The gate check in CI computes the fingerprint, which needs a
// checkout, so the verifier trusts the gate's conclusion and takes the features from the report.
export function createWringerVerifier(options: WringerVerifierOptions): Verifier {
  return {
    readAt: async (pullRequest, head) => {
      const checks = await options.forge.readChecks(pullRequest.repo, head);

      const gate = pickGateState(checks.get(options.gateCheck));

      if (gate === null) {
        return { status: 'not-covered', head };
      }

      const body = await options.forge.readPullRequestBody(pullRequest);

      return buildVerifyReading(head, gate, body);
    },
  };
}

// Only the workflow's check run counts: any token that may write statuses could post a commit
// status of the gate's name. A cancelled or skipped run gave no verdict, as a run still going.
function pickGateState(gate: CheckReading | undefined): 'success' | 'failure' | null {
  if (gate?.source !== 'check-run') {
    return null;
  }

  return gate.state === 'success' || gate.state === 'failure' ? gate.state : null;
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
