import type { AuthAdmin } from '@boxxy/auth-oauth';
import { ORPCError } from '@orpc/server';
import type { ServerDeps } from '../types.ts';
import { api } from './api.ts';

// What the owner does to the public door's sign-in: enroll a passkey, add and remove clients, and
// revoke grants. A server with no public door answers AUTH_NOT_CONFIGURED.
export const authHandlers = {
  enroll: api.auth.enroll.handler(async (options) => {
    const enrollment = await readAdmin(
      options.context.deps,
      options.errors.AUTH_NOT_CONFIGURED,
    ).enroll();

    return { token: enrollment.token, link: enrollment.link };
  }),
  addClient: api.auth.addClient.handler(async (options) => {
    const added = await readAdmin(
      options.context.deps,
      options.errors.AUTH_NOT_CONFIGURED,
    ).addClient(options.input.name, options.input.redirectURIs);

    if (added.kind === 'refused') {
      throw new ORPCError('BAD_REQUEST', { message: added.message });
    }

    if (added.kind === 'conflict') {
      throw new ORPCError('CONFLICT', {
        message: `a client is already named '${added.name}'; pick another name`,
      });
    }

    return { client: added.clientID, name: added.name };
  }),
  listClients: api.auth.listClients.handler(async (options) => {
    const clients = await readAdmin(
      options.context.deps,
      options.errors.AUTH_NOT_CONFIGURED,
    ).listClients();

    return {
      clients: clients.map((client) => ({
        client: client.clientID,
        name: client.name,
        redirectURIs: [...client.redirectURIs],
        createdAt: client.createdAt,
      })),
    };
  }),
  removeClient: api.auth.removeClient.handler(async (options) => {
    const answer = await readAdmin(
      options.context.deps,
      options.errors.AUTH_NOT_CONFIGURED,
    ).removeClient(options.input.client);

    if (answer.kind === 'ambiguous') {
      throw new ORPCError('CONFLICT', {
        message: `another client is also named '${answer.name}', and the door removes a client by its name`,
      });
    }

    return { removed: answer.kind === 'removed' };
  }),
  listGrants: api.auth.listGrants.handler(async (options) => {
    const grants = await readAdmin(
      options.context.deps,
      options.errors.AUTH_NOT_CONFIGURED,
    ).listGrants();

    return {
      grants: grants.map((grant) => ({
        grant: grant.grantID,
        client: grant.clientID,
        clientName: grant.clientName,
        scopes: [...grant.scopes],
        createdAt: grant.createdAt,
        lastUsedAt: grant.lastUsedAt,
      })),
    };
  }),
  revokeGrant: api.auth.revokeGrant.handler(async (options) => ({
    revoked: await readAdmin(options.context.deps, options.errors.AUTH_NOT_CONFIGURED).revokeGrant(
      options.input.grant,
    ),
  })),
};

function readAdmin(deps: ServerDeps, notConfigured: () => Error): AuthAdmin {
  if (deps.auth === null) {
    throw notConfigured();
  }

  return deps.auth;
}
