import { buildErrorResult, buildTextResult } from '../cli/build-answer-result.ts';
import { makeAnswerRun } from '../cli/make-answer-run.ts';
import type { Command } from '../types.ts';

// The commands that manage who may reach the public door. They run over the owner listener only.
export const authCommands: readonly Command[] = [
  {
    path: ['auth', 'enroll'],
    procedure: 'auth.enroll',
    summary: 'Prints a one-time link that enrolls a passkey for the public door.',
    options: {},
    run: async (call) => {
      const enrollment = await call.client.auth.enroll({});

      return buildTextResult(
        `Enrollment link: ${enrollment.link}\nIt enrolls one passkey and expires soon. Open it in your browser now.`,
      );
    },
  },
  {
    path: ['auth', 'clients', 'add'],
    procedure: 'auth.addClient',
    summary: 'Adds a client that may ask the owner for a grant.',
    options: { 'redirect-uri': { type: 'string', multiple: true } },
    run: async (call) => {
      const added = await call.client.auth.addClient({
        name: call.args.positional(0, 'name'),
        redirectURIs: call.args.strings('redirect-uri'),
      });

      return buildTextResult(`Added ${added.name}. Its client ID is ${added.client}`);
    },
  },
  {
    path: ['auth', 'clients', 'list'],
    procedure: 'auth.listClients',
    summary: 'Lists the clients that may ask the owner for a grant.',
    options: {},
    run: makeAnswerRun((call) => call.client.auth.listClients({})),
  },
  {
    path: ['auth', 'clients', 'remove'],
    procedure: 'auth.removeClient',
    summary: 'Removes a client and revokes every grant it held.',
    options: {},
    run: async (call) => {
      const client = call.args.positional(0, 'client');

      const answer = await call.client.auth.removeClient({ client });

      return answer.removed
        ? buildTextResult(`Removed client ${client} and revoked every grant it held`)
        : buildErrorResult(`boxxy auth clients remove: no client has the ID '${client}'`);
    },
  },
  {
    path: ['auth', 'grants', 'list'],
    procedure: 'auth.listGrants',
    summary: 'Lists the grants that clients hold.',
    options: {},
    run: makeAnswerRun((call) => call.client.auth.listGrants({})),
  },
  {
    path: ['auth', 'grants', 'revoke'],
    procedure: 'auth.revokeGrant',
    summary: 'Revokes one grant, so its tokens stop working.',
    options: {},
    run: async (call) => {
      const grant = call.args.positional(0, 'grant');

      const answer = await call.client.auth.revokeGrant({ grant });

      return answer.revoked
        ? buildTextResult(`Revoked grant ${grant}`)
        : buildErrorResult(`boxxy auth grants revoke: no grant has the ID '${grant}'`);
    },
  },
];
