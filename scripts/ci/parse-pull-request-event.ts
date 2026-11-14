import { findField } from './find-field.ts';

export interface PullRequestAuthor {
  readonly type: string;
  readonly login: string;
}

type PullRequestEvent =
  | {
      readonly kind: 'parsed';
      readonly body: string;
      readonly baseRef: string;
      readonly headRef: string;
      readonly author: PullRequestAuthor | null;
    }
  | { readonly kind: 'refused'; readonly message: string };

// The event file GitHub writes for a `pull_request` run. A pull request with no body has a null
// one.
export function parsePullRequestEvent(text: string): PullRequestEvent {
  const pullRequest = findField(parseJSON(text), 'pull_request');
  const body = findField(pullRequest, 'body');
  const baseRef = findField(findField(pullRequest, 'base'), 'ref');
  const headRef = findField(findField(pullRequest, 'head'), 'ref');

  if (typeof baseRef !== 'string' || baseRef === '') {
    return { kind: 'refused', message: 'the event holds no pull_request.base.ref' };
  }

  if (body !== null && typeof body !== 'string') {
    return { kind: 'refused', message: 'the event holds no pull_request.body' };
  }

  return {
    kind: 'parsed',
    body: body ?? '',
    baseRef,
    headRef: typeof headRef === 'string' ? headRef : '',
    author: parseAuthor(findField(pullRequest, 'user')),
  };
}

function parseJSON(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}

function parseAuthor(user: unknown): PullRequestAuthor | null {
  const type = findField(user, 'type');
  const login = findField(user, 'login');

  return typeof type === 'string' && typeof login === 'string' ? { type, login } : null;
}
