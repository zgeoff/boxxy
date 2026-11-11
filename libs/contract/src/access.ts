// `caller` says who the procedure is for, and the root middleware of the server checks it. `actor`
// is the actor that the fact of a write records. `tool` is the MCP endpoint that lists the
// procedure: `owner` is `/mcp`, `session` is `/mcp/session`.

export type Caller = 'owner' | 'session' | 'hook';

export interface Access {
  readonly caller: Caller;
  readonly actor: 'boxxy:owner:local' | 'boxxy:attempt:<id>' | 'boxxy:hook:<id>' | 'none';
  readonly tool: 'owner' | 'session' | 'none';
  readonly cli: string;
}

export const access = {
  // The owner's agent files and steers work on the owner's behalf, so it gets every command on an
  // item and every read: 17 tools. `rules.dryRun` is a read that is CLI only.
  'item.file': buildOwnerWrite(
    'boxxy item file --repo --title --outcome [--acceptance]… [--kind] [--design-mode] [--blocked-by]… [--label]…',
  ),
  'item.edit': buildOwnerWrite(
    'boxxy item edit <item> [--title] [--outcome] [--acceptance]… [--design-mode] [--label]…',
  ),
  'item.close': buildOwnerWrite('boxxy item close <item> --reason [--of]'),
  'item.retry': buildOwnerWrite('boxxy item retry <item> [--phase]'),
  'item.wake': buildOwnerWrite('boxxy item wake <item>'),
  'item.note': buildOwnerWrite('boxxy item note <item> --text'),
  'relation.add': buildOwnerWrite('boxxy relation add <source> <type> <target>'),
  'relation.remove': buildOwnerWrite('boxxy relation remove <source> <type> <target>'),
  'plan.defer': buildOwnerWrite('boxxy defer <item> [--until] --reason'),
  'plan.undefer': buildOwnerWrite('boxxy undefer <item>'),
  'plan.expedite': buildOwnerWrite('boxxy expedite <item>… --reason [--expires]'),
  'plan.unexpedite': buildOwnerWrite('boxxy unexpedite <item>'),
  'item.get': buildOwnerRead('boxxy item show <item>'),
  'item.list': buildOwnerRead('boxxy item list [--state] [--repo] [--phase] [--text] [--label]'),
  'runner.status': buildOwnerRead('boxxy status'),
  'report.cost': buildOwnerRead('boxxy cost <item>'),
  'report.stageTimes': buildOwnerRead('boxxy times <item>'),

  // An agent in a session needs three things: what it works on, a place for evidence, and the
  // close-out. Three tools, on their own endpoint, so a session's tool list holds no command on
  // another item.
  'attempt.current': {
    caller: 'session',
    actor: 'none',
    tool: 'session',
    cli: 'boxxy attempt current',
  },
  'attempt.evidence': {
    caller: 'session',
    actor: 'boxxy:attempt:<id>',
    tool: 'session',
    cli: 'boxxy attempt evidence --kind --ref [--observed]',
  },
  'attempt.closeOut': {
    caller: 'session',
    actor: 'boxxy:attempt:<id>',
    tool: 'session',
    cli: 'boxxy attempt close-out   (JSON on stdin)',
  },

  // Not tools: a hook program calls them with a hook payload.
  'attempt.bindSession': {
    caller: 'hook',
    actor: 'boxxy:hook:<id>',
    tool: 'none',
    cli: 'boxxy hook session-start   (hook payload on stdin)',
  },
  'attempt.recordPullRequest': {
    caller: 'hook',
    actor: 'boxxy:hook:<id>',
    tool: 'none',
    cli: 'boxxy hook post-tool-use   (hook payload on stdin)',
  },

  // Not tools: each one switches the server itself, not one item, and writes no fact that would
  // show who did it. They are for a person at the CLI.
  'runner.pause': { caller: 'owner', actor: 'none', tool: 'none', cli: 'boxxy runner pause' },
  'runner.resume': { caller: 'owner', actor: 'none', tool: 'none', cli: 'boxxy runner resume' },
  'outbox.retry': { caller: 'owner', actor: 'none', tool: 'none', cli: 'boxxy outbox retry' },

  // Not a tool, by choice: its input is a whole rules file, and it writes nothing.
  'rules.dryRun': {
    caller: 'owner',
    actor: 'none',
    tool: 'none',
    cli: 'boxxy rules dry-run <file>',
  },
} as const satisfies Record<string, Access>;

export type ProcedureName = keyof typeof access;

function buildOwnerWrite(cli: string): Access {
  return { caller: 'owner', actor: 'boxxy:owner:local', tool: 'owner', cli };
}

function buildOwnerRead(cli: string): Access {
  return { caller: 'owner', actor: 'none', tool: 'owner', cli };
}
