// `caller` says who the procedure is for, and the root middleware of the server checks it. `actor`
// is the actor that the fact of a write records. `tool` is the MCP endpoint that lists the
// procedure: `owner` is `/mcp`, `session` is `/mcp/session`.

export type Caller = 'owner' | 'session' | 'hook';

// What a token of the public door must hold to call a procedure. `read` is for a procedure that
// changes nothing, and `write` for one that changes state. `none` is a procedure the public door
// never serves.
export const grantScopes = ['read', 'write'] as const;

export type GrantScope = (typeof grantScopes)[number];

export interface Access {
  readonly caller: Caller;
  readonly actor: 'boxxy:owner:local' | 'boxxy:attempt:<id>' | 'boxxy:hook:<id>' | 'none';
  readonly tool: 'owner' | 'session' | 'none';
  readonly cli: string;
  readonly scope: GrantScope | 'none';
}

export const access = {
  // The owner's agent files and steers work for the owner: every command on an item, every read,
  // the runner's two switches and the notice session, 22 tools. `rules.dryRun` is a read that is
  // CLI only. Only this path files a held item, releases one or lists the held items.
  'item.file': buildOwnerWrite(
    'boxxy item file --repo --title --outcome [--body | --body-file] [--acceptance]… [--kind] [--design-mode] [--blocked-by]… [--label]… [--held <reason>]',
  ),
  'item.edit': buildOwnerWrite(
    'boxxy item edit <item> [--title] [--outcome] [--body | --body-file] [--acceptance]… [--design-mode] [--label]…',
  ),
  'item.close': buildOwnerWrite('boxxy item close <item> --reason [--of]'),
  'item.retry': buildOwnerWrite('boxxy item retry <item> [--phase]'),
  'item.wake': buildOwnerWrite('boxxy item wake <item>'),
  'item.release': buildOwnerWrite('boxxy item release <item>'),
  'item.note': buildOwnerWrite('boxxy item note <item> --text'),
  'relation.add': buildOwnerWrite('boxxy relation add <source> <type> <target>'),
  'relation.remove': buildOwnerWrite('boxxy relation remove <source> <type> <target>'),
  'runner.pause': buildOwnerSwitch('boxxy runner pause'),
  'runner.resume': buildOwnerSwitch('boxxy runner resume'),
  'notices.register': buildOwnerSwitch('boxxy notices register <gateway-id>'),
  'notices.show': buildOwnerRead('boxxy notices show'),
  'plan.defer': buildOwnerWrite('boxxy defer <item> [--until] --reason'),
  'plan.undefer': buildOwnerWrite('boxxy undefer <item>'),
  'plan.expedite': buildOwnerWrite('boxxy expedite <item>… --reason [--expires]'),
  'plan.unexpedite': buildOwnerWrite('boxxy unexpedite <item>'),
  'item.get': buildOwnerRead('boxxy item show <item>'),
  'item.list': buildOwnerRead(
    'boxxy item list [--state | --held] [--repo] [--phase] [--text] [--label]',
  ),
  'runner.status': buildOwnerRead('boxxy status'),
  'report.cost': buildOwnerRead('boxxy cost <item>'),
  'report.stageTimes': buildOwnerRead('boxxy times <item>'),

  // An agent in a session needs what it works on, a place for evidence, the close-out, and a
  // read of the other items of its repo. Five tools, on their own endpoint, so a session's tool
  // list holds no command on another item.
  'attempt.current': {
    caller: 'session',
    actor: 'none',
    tool: 'session',
    cli: 'boxxy attempt current',
    scope: 'none',
  },
  'attempt.evidence': {
    caller: 'session',
    actor: 'boxxy:attempt:<id>',
    tool: 'session',
    cli: 'boxxy attempt evidence --kind --ref [--observed]',
    scope: 'none',
  },
  'attempt.closeOut': {
    caller: 'session',
    actor: 'boxxy:attempt:<id>',
    tool: 'session',
    cli: 'boxxy attempt close-out   (JSON on stdin)',
    scope: 'none',
  },
  'attempt.listItems': {
    caller: 'session',
    actor: 'none',
    tool: 'session',
    cli: 'boxxy attempt list-items [--state] [--phase] [--text] [--label]',
    scope: 'none',
  },
  'attempt.getItem': {
    caller: 'session',
    actor: 'none',
    tool: 'session',
    cli: 'boxxy attempt show-item <item>',
    scope: 'none',
  },

  // Not tools: a hook program calls them with a hook payload.
  'attempt.bindSession': {
    caller: 'hook',
    actor: 'boxxy:hook:<id>',
    tool: 'none',
    cli: 'boxxy hook session-start   (hook payload on stdin)',
    scope: 'none',
  },
  'attempt.recordPullRequest': {
    caller: 'hook',
    actor: 'boxxy:hook:<id>',
    tool: 'none',
    cli: 'boxxy hook post-tool-use   (hook payload on stdin)',
    scope: 'none',
  },

  // Not a tool: it acts on the whole outbox, not one item, and writes no fact that would show who
  // did it. It is for a person at the CLI.
  'outbox.retry': {
    caller: 'owner',
    actor: 'none',
    tool: 'none',
    cli: 'boxxy outbox retry',
    scope: 'write',
  },

  // Not a tool, by choice: its input is a whole rules file, and it writes nothing.
  'rules.dryRun': {
    caller: 'owner',
    actor: 'none',
    tool: 'none',
    cli: 'boxxy rules dry-run <file>',
    scope: 'read',
  },

  // Not tools: they manage who may reach the public door, so they stay on the private owner
  // listener, for a person at the CLI.
  'auth.enroll': buildOwnerAdmin('boxxy auth enroll', 'write'),
  'auth.addClient': buildOwnerAdmin('boxxy auth clients add <name> --redirect-uri…', 'write'),
  'auth.listClients': buildOwnerAdmin('boxxy auth clients list', 'read'),
  'auth.removeClient': buildOwnerAdmin('boxxy auth clients remove <client>', 'write'),
  'auth.listGrants': buildOwnerAdmin('boxxy auth grants list', 'read'),
  'auth.revokeGrant': buildOwnerAdmin('boxxy auth grants revoke <grant>', 'write'),
} as const satisfies Record<string, Access>;

export type ProcedureName = keyof typeof access;

function buildOwnerWrite(cli: string): Access {
  return { caller: 'owner', actor: 'boxxy:owner:local', tool: 'owner', cli, scope: 'write' };
}

// A switch of the server itself writes no fact that would show who did it, so it has no actor.
function buildOwnerSwitch(cli: string): Access {
  return { caller: 'owner', actor: 'none', tool: 'owner', cli, scope: 'write' };
}

function buildOwnerRead(cli: string): Access {
  return { caller: 'owner', actor: 'none', tool: 'owner', cli, scope: 'read' };
}

function buildOwnerAdmin(cli: string, scope: GrantScope): Access {
  return { caller: 'owner', actor: 'none', tool: 'none', cli, scope };
}
