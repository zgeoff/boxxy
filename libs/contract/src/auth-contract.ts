import { oc } from '@orpc/contract';
import { z } from 'zod';

const id = z.string().min(1).max(64);
const time = z.iso.datetime({ offset: true });
const text100 = z.string().min(1).max(100);
const emptyInput = z.object({});

const authErrors = {
  AUTH_NOT_CONFIGURED: { message: 'this boxxy server has no public door' },
};

const redirectURI = z.string().min(1).max(500);

const addClientInput = z.object({
  name: text100,
  redirectURIs: z.array(redirectURI).min(1).max(10),
});

const clientView = z.object({
  client: id,
  name: z.string().max(100),
  redirectURIs: z.array(z.string()),
  createdAt: z.string().nullable(),
});

const grantView = z.object({
  grant: id,
  client: id,
  clientName: z.string().max(100),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

const enrollOutput = z.object({
  token: z.string().min(1).max(200),
  link: z.string().max(500),
  expiresAt: time,
});

// These manage who may reach the public door. Each answers AUTH_NOT_CONFIGURED when the server's
// configuration has no public door.
export const authContract = {
  // Writes the hash of a fresh one-time token and answers the token and the link to enter it at.
  enroll: oc.errors(authErrors).input(emptyInput).output(enrollOutput),
  addClient: oc
    .errors(authErrors)
    .input(addClientInput)
    .output(z.object({ client: id, name: text100 })),
  listClients: oc
    .errors(authErrors)
    .input(emptyInput)
    .output(z.object({ clients: z.array(clientView) })),
  removeClient: oc
    .errors(authErrors)
    .input(z.object({ client: id }))
    .output(z.object({ removed: z.boolean() })),
  listGrants: oc
    .errors(authErrors)
    .input(emptyInput)
    .output(z.object({ grants: z.array(grantView) })),
  revokeGrant: oc
    .errors(authErrors)
    .input(z.object({ grant: id }))
    .output(z.object({ revoked: z.boolean() })),
};
