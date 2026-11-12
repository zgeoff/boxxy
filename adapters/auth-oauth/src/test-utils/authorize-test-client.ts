import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { PublicDoor } from '../http/create-public-door.ts';
import { buildStubAuthenticator } from './build-stub-authenticator.ts';

interface AuthorizeInput {
  // the origin the door was created with, such as `https://boxxy.example`
  readonly origin: string;

  // the scopes the client asks for, and the ones the owner ticks on the consent page
  readonly requested: readonly string[];
  readonly ticked: readonly string[];
}

export interface TestGrant {
  readonly clientID: string;
  readonly accessToken: string;
  readonly refreshToken: string;
}

const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string() });

// Runs the whole sign-in against a door, the way a client and the owner's browser would: enrolls a
// passkey, adds a client, then authorizes it with a passkey sign-in, consent and a code exchange.
export async function authorizeTestClient(
  door: PublicDoor,
  input: AuthorizeInput,
): Promise<TestGrant> {
  const authenticator = buildStubAuthenticator();

  const host = new URL(input.origin).host;

  const redirectURI = 'https://client.example/callback';

  const send = (path: string, init: RequestInit & { readonly cookie?: string } = {}) => {
    const headers = new Headers(init.headers);

    headers.set('host', host);

    if (init.method === 'POST') {
      headers.set('origin', input.origin);
    }

    if (init.cookie !== undefined) {
      headers.set('cookie', init.cookie);
    }

    return door.answerRequest(new Request(`${input.origin}${path}`, { ...init, headers }));
  };

  const postForm = (
    path: string,
    fields: Readonly<Record<string, string | string[]>>,
    cookie?: string,
  ) => {
    const body = new URLSearchParams();

    for (const [name, value] of Object.entries(fields)) {
      for (const item of [value].flat()) {
        body.append(name, item);
      }
    }

    return send(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      ...(cookie === undefined ? {} : { cookie }),
    });
  };

  const enrollment = await door.admin.enroll();
  const enrolling = await postForm('/enroll', { token: enrollment.token });
  const enrollingPage = await enrolling.text();

  const creation = readOptions(enrollingPage);

  const registration = await authenticator.create(
    {
      challenge: String(creation['challenge']),
      rp: { id: new URL(input.origin).hostname },
      user: { id: 'b3duZXI' },
    },
    { origin: input.origin },
  );

  const enrolled = await postForm('/enroll', {
    token: enrollment.token,
    credential: JSON.stringify(registration),
  });

  if (enrolled.status !== 200) {
    throw new Error(`the stub passkey did not enroll: ${enrolled.status}`);
  }

  const added = await door.admin.addClient('test client', [redirectURI]);

  if (added.kind !== 'added') {
    throw new Error('the test client was refused');
  }

  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const authorizeQuery = new URLSearchParams({
    response_type: 'code',
    client_id: added.clientID,
    redirect_uri: redirectURI,
    scope: input.requested.join(' '),
    state: 'state-1',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const authorized = await send(`/oauth2/authorize?${authorizeQuery.toString()}`);

  const loginLocation = new URL(authorized.headers.get('location') ?? '', input.origin);

  const oauthQuery = loginLocation.search.slice(1);

  const loginPage = await send(`${loginLocation.pathname}${loginLocation.search}`);
  const loginHtml = await loginPage.text();

  const request = readOptions(loginHtml);

  const assertion = await authenticator.signAssertion(
    { challenge: String(request['challenge']), rpId: new URL(input.origin).hostname },
    { origin: input.origin },
  );

  const signedIn = await postForm('/login', {
    oauth_query: oauthQuery,
    credential: JSON.stringify(assertion),
  });

  const cookie = signedIn.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');

  const consentLocation = new URL(signedIn.headers.get('location') ?? '', input.origin);

  const consented = await postForm(
    '/consent',
    {
      oauth_query: consentLocation.search.slice(1),
      decision: 'approve',
      scope: [...input.ticked],
    },
    cookie,
  );

  const code = new URL(consented.headers.get('location') ?? '', redirectURI).searchParams.get(
    'code',
  );

  if (code === null) {
    throw new Error(`the consent issued no code: ${consented.status}`);
  }

  const exchanged = await postForm('/oauth2/token', {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectURI,
    client_id: added.clientID,
    code_verifier: verifier,
    resource: `${input.origin}/mcp`,
  });

  const exchangedBody: unknown = await exchanged.json();

  const tokens = tokenSchema.parse(exchangedBody);

  return {
    clientID: added.clientID,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  };
}

const scriptSchema = z.object({ options: z.record(z.string(), z.unknown()) });

// The WebAuthn options that a page carries in its passkey script block.
function readOptions(page: string): Record<string, unknown> {
  const block = /<script type="application\/json" id="boxxy-passkey">(?<json>.*?)<\/script>/su.exec(
    page,
  )?.groups?.['json'];

  if (block === undefined) {
    throw new Error('the page carries no passkey options');
  }

  return scriptSchema.parse(JSON.parse(block.replaceAll(String.raw`\u003c`, '<'))).options;
}
