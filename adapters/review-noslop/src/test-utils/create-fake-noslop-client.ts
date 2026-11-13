import type { ReviewResult } from '@noslop/cli';
import { reviewResultSchema } from '@noslop/cli';
import type { PullRequestCheck } from '@noslop/cli/check';
import type { NoslopClient } from '../types.ts';
import { buildMockRequestError } from './build-mock-request-error.ts';

interface FakeNoslopClientInput {
  // the pull request's head on the forge
  readonly head: string;

  // what `check` answers after a post
  readonly outcome: PullRequestCheck;

  // true: GitHub gives no answer, so every call fails as a network failure does
  readonly down?: boolean;

  // GitHub answers this HTTP status to the App's reads, as it answers 404 for a repo the App is
  // not installed on; `on` names the call that gets it
  readonly refuses?: { readonly status: number; readonly on: 'post' | 'check' };
}

export interface FakeNoslopClient extends NoslopClient {
  readonly posted: ReviewResult[];
  readonly checked: number;
}

// noslop's two calls, against one pull request at `head`. A result for another head is refused
// with the error noslop throws.
export function createFakeNoslopClient(input: FakeNoslopClientInput): FakeNoslopClient {
  const posted: ReviewResult[] = [];
  let checked = 0;

  return {
    posted,
    get checked() {
      return checked;
    },
    sendResult: (result) => {
      const review = reviewResultSchema.parse(result);

      if (input.down === true) {
        return Promise.reject(
          new Error('noslop posts only a verified result, so it refuses this one: fetch failed', {
            cause: new Error('fetch failed'),
          }),
        );
      }

      if (input.refuses?.on === 'post') {
        const answer = buildRequestError(input.refuses.status);

        return Promise.reject(
          new Error(
            `noslop posts only a verified result, so it refuses this one: ${answer.message}`,
            {
              cause: answer,
            },
          ),
        );
      }

      if (review.head !== input.head) {
        const reason = `the result does not verify: it reviews ${review.head.slice(0, 12)}, but the head of the pull request is ${input.head.slice(0, 12)}`;

        return Promise.reject(
          new Error(`noslop posts only a verified result, so it refuses this one: ${reason}`, {
            cause: new Error(reason),
          }),
        );
      }

      posted.push(review);

      return Promise.resolve(review);
    },
    check: () => {
      if (input.down === true) {
        return Promise.reject(new Error('fetch failed'));
      }

      if (input.refuses?.on === 'check') {
        return Promise.reject(buildRequestError(input.refuses.status));
      }

      checked += 1;

      return Promise.resolve(input.outcome);
    },
  };
}

// The shape of Octokit's request error, which noslop throws for an HTTP answer it does not expect
function buildRequestError(status: number): Error {
  const text = status === 404 ? 'Not Found' : 'Refused';

  return buildMockRequestError(
    status,
    `${text} - https://docs.github.com/rest/pulls/pulls#get-a-pull-request`,
  );
}
