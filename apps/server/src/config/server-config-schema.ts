import { gitSourceSchema } from '@boxxy/model';
import { z } from 'zod';

const name = z.string().min(1);

const address = z.strictObject({
  hostname: name,

  // 0 asks the system for a free port
  port: z.int().min(0).max(65_535),
});

const agentScope = z.strictObject({
  phases: z.array(name).min(1),

  // each one is in `spawn.repos`; with none, the agent may run in any repo
  repos: z.array(name).exactOptional(),
});

// with `requireScopedAgent`, every recipe that can run the phase names an agent listed for it
const phasePolicy = z.strictObject({ requireScopedAgent: z.boolean().exactOptional() });

const spawnSection = z.strictObject({
  target: name,

  // by repo: its folder on a target on the atc daemon's own host, or the git source that atc
  // clones for a target that gives each session a fresh machine
  repos: z.record(z.string(), z.union([name, gitSourceSchema])),

  // the atc agents whose broker profile holds a credential, each with where it may run
  agents: z.record(name, agentScope).default({}),

  // by phase: its spawn policy
  phases: z.record(name, phasePolicy).default({}),
});

const atcSection = z.strictObject({
  // the atc gateway's MCP endpoint, such as its in-cluster Service address
  url: z.url(),

  // the gateway's public host name, sent as `Host`, such as `atc.example.com`; the gateway answers
  // 403 to any other host. With none, the client sends the host of the URL.
  host: z
    .string()
    .regex(/^[a-z0-9.-]+(?::[0-9]{1,5})?$/u)
    .optional(),

  // by worker target: the folders the agent trusts, each with its subfolders
  trustedFolders: z.record(z.string(), z.array(name)),
});

const folders = z.array(name).min(1);

// the folders of the trust documents, one file per issuer, and the audience the tokens name
const trustedIssuersSection = z.strictObject({ folders, audience: name });

const pepysSection = z.strictObject({
  // the receive route of boxxy's source on pepys ingest
  ingestUrl: z.url(),

  // the oRPC route of the pepys query API
  apiUrl: z.url(),
  environment: name,
});

// The public door: the owner's MCP endpoint behind OAuth, on a listener of its own.
const publicDoorSection = z.strictObject({
  // 0 asks the system for a free port
  port: z.int().min(0).max(65_535),

  // the address to bind; loopback by default, so a door that other machines reach is a choice
  hostname: name.default('127.0.0.1'),

  // the https origin that clients reach the door at: the OAuth issuer. Plain http is for a
  // loopback address only.
  publicURL: z.url(),

  // the socket peers whose `CF-Connecting-IP` header a security event labels trusted, each exactly
  // as the socket reports its address
  trustForwardedFrom: z.array(name).default([]),

  // the auth database; beside the store file when left out
  authFile: name.optional(),

  // the file of the service clients, which hold only the digests of their secrets; the server reads
  // it again on SIGHUP. With none, the door takes no service client.
  serviceTokensFile: name.optional(),
});

// The server's configuration file, as JSON, at the path in `BOXXY_CONFIG`. It holds no secret:
// each token comes from the environment.
const serverConfigObject = z.strictObject({
  runner: name,
  store: z.strictObject({ file: name }),

  // a git checkout, or a plain folder with no `.git`. A checkout loads only a commit that `ref`
  // holds, such as the merged history of the rules repo; a plain folder has no ref.
  rules: z.strictObject({ folder: name, ref: name.default('origin/main') }),
  api: z.strictObject({
    // the owner's private network: `/rpc`, `/mcp` and `/healthz`, with no token
    listen: address,

    // the broker's target: `/rpc` and `/mcp/session`, with the worker token on every request
    workerListen: address,
  }),
  spawn: spawnSection,
  atc: atcSection,

  // with none, every session and hook call is refused
  trustedIssuers: trustedIssuersSection.optional(),

  // with none, no fact is sent, and the two reports answer PEPYS_NOT_CONFIGURED
  pepys: pepysSection.optional(),

  // with none, the server serves no public door
  publicDoor: publicDoorSection.optional(),

  // GitHub's REST root, or the broker's; with none, the hook's link answers `retry`, and no
  // pull request watch runs
  github: z.strictObject({ baseUrl: z.url() }).optional(),
});

export const serverConfigSchema = serverConfigObject.superRefine((config, ctx) => {
  for (const [agent, scope] of Object.entries(config.spawn.agents)) {
    for (const repo of scope.repos ?? []) {
      if (!Object.hasOwn(config.spawn.repos, repo)) {
        ctx.addIssue({
          code: 'custom',
          path: ['spawn', 'agents', agent, 'repos'],
          message: `${repo} is not in spawn.repos`,
        });
      }
    }
  }
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
