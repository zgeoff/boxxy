import { PUBLIC_DOOR_PATHS } from '../http/public-door-paths.ts';
import type { AuthClock } from '../utils/types.ts';
import { createEnrollmentToken } from './create-enrollment-token.ts';
import { isAllowedRedirectURI } from './is-allowed-redirect-uri.ts';
import { normalizeClientName } from './normalize-client-name.ts';
import type { openMCPAuth } from './open-mcp-auth.ts';
import { readClientViews } from './read-client-views.ts';
import type { ClientView } from './read-client-views.ts';
import { readGrantViews } from './read-grant-views.ts';
import type { GrantView } from './read-grant-views.ts';
import { removeClient } from './remove-client.ts';
import { revokeGrant } from './revoke-grant.ts';

type MCPAuth = Awaited<ReturnType<typeof openMCPAuth>>;

export interface AuthAdminInput {
  readonly store: MCPAuth;
  readonly origin: string;
  readonly clock: AuthClock;
}

export type AddClientAnswer =
  | { readonly kind: 'added'; readonly clientID: string; readonly name: string }
  | { readonly kind: 'refused'; readonly redirectURI: string };

export interface EnrollmentLink {
  readonly token: string;
  readonly link: string;
  readonly expiresAt: number;
}

// What the owner's commands do to the authorization database: add and remove clients, revoke
// grants, and mint the token that enrolls a passkey.
export interface AuthAdmin {
  readonly enroll: () => Promise<EnrollmentLink>;
  readonly addClient: (name: string, redirectURIs: readonly string[]) => Promise<AddClientAnswer>;
  readonly listClients: () => Promise<readonly ClientView[]>;
  readonly removeClient: (clientID: string) => Promise<boolean>;
  readonly listGrants: () => Promise<readonly GrantView[]>;
  readonly revokeGrant: (grantID: string) => Promise<boolean>;
}

export function createAuthAdmin(input: AuthAdminInput): AuthAdmin {
  const store = input.store;
  const origin = input.origin;
  const clock = input.clock;

  return {
    enroll: async () => {
      const created = await createEnrollmentToken(store.db, clock.now());

      return {
        token: created.token,
        link: `${origin}${PUBLIC_DOOR_PATHS.browser.enroll}?token=${created.token}`,
        expiresAt: created.expiresAt,
      };
    },
    addClient: async (name, redirectURIs) => {
      const refused = redirectURIs.find((uri) => !isAllowedRedirectURI(uri));

      if (refused !== undefined) {
        return { kind: 'refused', redirectURI: refused };
      }

      const clientName = normalizeClientName(name);

      const created = await store.auth.api.createFixedClient({
        body: { name: clientName, redirectURIs: [...redirectURIs] },
      });

      return { kind: 'added', clientID: created.clientID, name: clientName };
    },
    listClients: () => readClientViews(store.db),
    removeClient: (clientID) => removeClient(store.db, clientID),
    listGrants: () => readGrantViews(store.db),
    revokeGrant: (grantID) => revokeGrant(store.db, grantID),
  };
}
