import type { GrantScope } from '@boxxy/contract';
import { grantScopes } from '@boxxy/contract';
import { MCPAuthError } from '@zgeoff/mcp-auth';
import type { ClientView, GrantID, GrantView, MCPAuth, OAuthClientID } from '@zgeoff/mcp-auth';
import { toTagged } from '@zgeoff/std';

export interface AuthAdminInput {
  readonly auth: MCPAuth<GrantScope>;
  readonly origin: string;
}

export type AddClientAnswer =
  | { readonly kind: 'added'; readonly clientID: string; readonly name: string }

  // the message says which rule the name or a redirect URI broke
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'conflict'; readonly name: string };

export type RemoveClientAnswer = { readonly kind: 'removed' } | { readonly kind: 'not-found' };

export interface EnrollmentLink {
  readonly token: string;
  readonly link: string;
}

export interface AuthGrantView {
  readonly grantID: string;
  readonly clientID: string;
  readonly clientName: string;
  readonly scopes: readonly GrantScope[];
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

// What the owner's commands do to the authorization database: add and remove clients, revoke
// grants, and mint the token that enrolls a passkey.
export interface AuthAdmin {
  readonly enroll: () => Promise<EnrollmentLink>;
  readonly addClient: (name: string, redirectURIs: readonly string[]) => Promise<AddClientAnswer>;
  readonly listClients: () => Promise<readonly ClientView[]>;
  readonly removeClient: (clientID: string) => Promise<RemoveClientAnswer>;
  readonly listGrants: () => Promise<readonly AuthGrantView[]>;
  readonly revokeGrant: (grantID: string) => Promise<boolean>;
}

export function createAuthAdmin(input: AuthAdminInput): AuthAdmin {
  const auth = input.auth;

  return {
    enroll: async () => {
      const token = await auth.passkeys.createEnrollmentToken();

      const link = new URL(`${input.origin}${auth.paths.browser.enroll}`);

      link.searchParams.set('token', token);

      return { token, link: link.href };
    },
    addClient: async (name, redirectURIs) => {
      try {
        const added = await auth.clients.add(name, redirectURIs);

        return { kind: 'added', clientID: added.clientID, name: added.name };
      } catch (error) {
        return pickAddRefusal(error, name);
      }
    },
    listClients: () => auth.clients.list(),
    removeClient: async (clientID) => {
      try {
        await auth.clients.remove(toTagged<OAuthClientID>(clientID));

        return { kind: 'removed' };
      } catch (error) {
        return pickRemoveRefusal(error);
      }
    },
    listGrants: async () => {
      const grants = await auth.grants.list();

      return grants.map((grant) => toAuthGrantView(grant));
    },

    // The package lists only grants with a live refresh token, and a grant can hold a live access
    // token without one, so the revoke goes to the package by ID.
    revokeGrant: (grantID) => auth.grants.revoke(toTagged<GrantID>(grantID)),
  };
}

// The package refuses a bad name or redirect URI, and a taken name, with a coded error; any other
// error is not the owner's input.
function pickAddRefusal(error: unknown, name: string): AddClientAnswer {
  if (!(error instanceof MCPAuthError)) {
    throw error;
  }

  if (error.code === 'conflict') {
    return { kind: 'conflict', name };
  }

  if (error.code === 'invalid-client-name' || error.code === 'invalid-redirect-uri') {
    return { kind: 'refused', message: error.message };
  }

  throw error;
}

// The package refuses an unknown client ID with a coded error; any other error is not the owner's
// input.
function pickRemoveRefusal(error: unknown): RemoveClientAnswer {
  if (error instanceof MCPAuthError && error.code === 'not-found') {
    return { kind: 'not-found' };
  }

  throw error;
}

function toAuthGrantView(grant: GrantView): AuthGrantView {
  return {
    grantID: grant.grantID,
    clientID: grant.clientID,
    clientName: grant.clientName,
    scopes: grantScopes.filter((scope) => grant.scopes.includes(scope)),
    createdAt: grant.createdAt,
    lastUsedAt: grant.lastUsedAt,
  };
}
