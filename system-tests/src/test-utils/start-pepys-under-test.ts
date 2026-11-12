import { createHmac } from 'node:crypto';
import type { FactSink, PepysReader } from '@boxxy/model';
import { createPepysReader } from '@boxxy/pepys/reader';
import { createPepysFactSink } from '@boxxy/pepys/sink';
import { createRealPepys } from '@boxxy/pepys/test-utils/create-real-pepys';
import type { TelemetryRequest } from '@boxxy/pepys/test-utils/create-test-pepys';

// A pull request as GitHub's `pull_request` webhook describes it when it merges.
export interface MergedPullRequest {
  readonly githubId: number;
  readonly repo: string;
  readonly number: number;
  readonly title: string;

  // ISO 8601, as GitHub writes it
  readonly openedAt: string;
  readonly mergedAt: string;
  readonly mergeCommit: string;
}

export interface PepysUnderTest extends AsyncDisposable {
  // boxxy's sink, signed with the deployment's secret, on ingest's fact batch route
  readonly sink: FactSink;

  // boxxy's reader of the two queries
  readonly reader: PepysReader;

  // GitHub's delivery of the merge, signed with the webhook secret, to ingest's webhook route
  readonly sendMergeWebhook: (pullRequest: MergedPullRequest) => Promise<Response>;

  // the agent's model requests, each with its proven sender
  readonly sendTelemetry: (requests: readonly TelemetryRequest[]) => Promise<void>;
}

const boxxySecret = 'boxxy-test-signing-secret';
const webhookSecret = 'github-test-webhook-secret';

// The journey reaches pepys only through this function. It starts the real pepys ingest and query
// API in process, with the real GitHub, telemetry and boxxy plug-ins on the kit's test store.
export async function startPepysUnderTest(): Promise<PepysUnderTest> {
  const pepys = await createRealPepys({ boxxySecret, webhookSecret });

  return {
    sink: createPepysFactSink({
      url: 'http://pepys.test/boxxy/facts',
      secret: boxxySecret,
      timeoutMs: 1000,
      fetch: pepys.handleRequest,
    }),
    reader: createPepysReader({
      client: pepys.client,
      environment: 'production',
      timeoutMs: 1000,
    }),
    sendMergeWebhook: (pullRequest) => {
      const body = JSON.stringify(buildMergeEvent(pullRequest));
      const signature = createHmac('sha256', webhookSecret).update(body).digest('hex');

      return pepys.handleRequest(
        new Request('http://pepys.test/webhook/github', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-github-event': 'pull_request',
            'x-github-delivery': `delivery-${pullRequest.githubId}-merged`,
            'x-hub-signature-256': `sha256=${signature}`,
          },
          body,
        }),
      );
    },
    sendTelemetry: (requests) => pepys.writeTelemetry(requests),
    [Symbol.asyncDispose]: () => pepys[Symbol.asyncDispose](),
  };
}

// The `closed` action of a merged pull request, with the fields the GitHub plug-in reads.
function buildMergeEvent(pullRequest: MergedPullRequest) {
  return {
    action: 'closed',
    number: pullRequest.number,
    pull_request: {
      id: pullRequest.githubId,
      number: pullRequest.number,
      title: pullRequest.title,
      state: 'closed',
      draft: false,
      merged: true,
      merge_commit_sha: pullRequest.mergeCommit,
      html_url: `https://github.com/${pullRequest.repo}/pull/${pullRequest.number}`,
      user: { id: 4401 },
      base: { repo: { id: 902 } },
      created_at: pullRequest.openedAt,
      updated_at: pullRequest.mergedAt,
      closed_at: pullRequest.mergedAt,
      merged_at: pullRequest.mergedAt,
    },
    sender: { id: 4401 },
  };
}
