import { findField } from './find-field.ts';

type PullRequestEvent =
  | { readonly kind: 'parsed'; readonly body: string; readonly baseRef: string }
  | { readonly kind: 'refused'; readonly message: string };

// The event file GitHub writes for a `pull_request` run. A pull request with no body has a null
// one.
export function parsePullRequestEvent(text: string): PullRequestEvent {
  const pullRequest = findField(parseJSON(text), 'pull_request');
  const body = findField(pullRequest, 'body');
  const baseRef = findField(findField(pullRequest, 'base'), 'ref');

  if (typeof baseRef !== 'string' || baseRef === '') {
    return { kind: 'refused', message: 'the event holds no pull_request.base.ref' };
  }

  if (body !== null && typeof body !== 'string') {
    return { kind: 'refused', message: 'the event holds no pull_request.body' };
  }

  return { kind: 'parsed', body: body ?? '', baseRef };
}

function parseJSON(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}
