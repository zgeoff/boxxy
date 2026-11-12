import { gitSourceSchema } from '@boxxy/model';
import { z } from 'zod';

const name = z.string().min(1);

const address = z.strictObject({
  hostname: name,

  // 0 asks the system for a free port
  port: z.int().min(0).max(65_535),
});

const spawnSection = z.strictObject({
  target: name,

  // by repo: its folder on a target on the atc daemon's own host, or the git source that atc
  // clones on a target that gives each session a fresh machine
  repos: z.record(z.string(), z.union([name, gitSourceSchema])),
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

  // the session that gets the hold notices; with none, no notice is sent
  noticeSession: name.optional(),
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

// The server's configuration file, as JSON, at the path in `BOXXY_CONFIG`. It holds no secret:
// each token comes from the environment.
export const serverConfigSchema = z.strictObject({
  runner: name,
  store: z.strictObject({ file: name }),

  // a git checkout, or a plain folder with no `.git`
  rules: z.strictObject({ folder: name }),
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

  // GitHub's REST root, or the broker's; with none, the hook's link answers `retry`, and no
  // pull request watch runs
  github: z.strictObject({ baseUrl: z.url() }).optional(),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
