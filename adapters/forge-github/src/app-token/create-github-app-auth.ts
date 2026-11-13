import { createAppAuth } from '@octokit/auth-app';
import { request } from '@octokit/request';
import { forgeLimits } from '../constants.ts';
import { GithubForgeError } from '../github-forge-error.ts';

// The boxxy App's keys. GitHub recommends the client ID over the numeric App ID as the JWT's `iss`.
export interface GithubAppKeys {
  readonly clientID: string;
  readonly privateKey: string;
  readonly installationID: number;
}

export interface GithubAppAuthOptions {
  readonly keys: GithubAppKeys;

  // the REST root that the forge calls, where GitHub mints the installation token
  readonly baseUrl: string;
  readonly fetch: typeof globalThis.fetch;
  readonly nowMs: () => number;
}

export interface GithubAppAuth {
  // the installation token, minted again before it expires
  readToken: () => Promise<string>;
}

interface HeldToken {
  readonly token: string;
  readonly expiresAtMs: number;
}

// Mints the App's installation token, holds it until `refreshMarginMs` before it expires, and
// shares one mint between the calls that wait on it. A failed mint is never held, so the next call
// mints again. The error names the status only: the request that failed carries the signed JWT.
export function createGithubAppAuth(options: GithubAppAuthOptions): GithubAppAuth {
  const auth = createAppAuth({
    appId: options.keys.clientID,
    privateKey: options.keys.privateKey,
    request: request.defaults({
      baseUrl: options.baseUrl.replace(/\/+$/u, ''),
      request: { fetch: options.fetch },
    }),
  });

  let held: HeldToken | null = null;
  let minting: Promise<string> | null = null;

  const mint = async (): Promise<string> => {
    try {
      const minted = await auth({
        type: 'installation',
        installationId: options.keys.installationID,
        refresh: true,
      });

      held = { token: minted.token, expiresAtMs: Date.parse(minted.expiresAt) };

      return minted.token;
    } catch (error) {
      throw new GithubForgeError(
        `GitHub did not mint the App's installation token (${toStatusText(error)})`,
        toStatus(error),
      );
    } finally {
      minting = null;
    }
  };

  return {
    readToken: () => {
      if (held !== null && held.expiresAtMs - options.nowMs() > forgeLimits.refreshMarginMs) {
        return Promise.resolve(held.token);
      }

      minting ??= mint();

      return minting;
    },
  };
}

function toStatusText(error: unknown): string {
  const status = toStatus(error);

  return status === null ? 'no answer' : `status ${status}`;
}

function toStatus(error: unknown): number | null {
  const status: unknown =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'status') : null;

  return typeof status === 'number' ? status : null;
}
