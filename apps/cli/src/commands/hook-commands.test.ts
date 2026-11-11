import { expect, test } from 'bun:test';
import { z } from 'zod';
import manifest from '../../hook-plugin/hooks/hooks.json';
import { pickCommand } from '../cli/pick-command.ts';
import { allCommands } from './all-commands.ts';
import { hookCommands } from './hook-commands.ts';

// The hook plug-in in the agent image runs the commands that its manifest names.
function setupTest() {
  const handler = z.object({ type: z.literal('command'), command: z.string() });
  const group = z.object({ matcher: z.string(), hooks: z.array(handler) });
  const manifestSchema = z.object({ hooks: z.record(z.string(), z.array(group)) });
  const parsed = manifestSchema.parse(manifest);

  const listCommands = (event: string) =>
    (parsed.hooks[event] ?? []).flatMap((entry) =>
      entry.hooks.map((hook) => `${entry.matcher}: ${hook.command}`),
    );

  return { parsed, listCommands };
}

test('it registers the session-start hook on SessionStart', () => {
  const ctx = setupTest();

  expect(ctx.listCommands('SessionStart')).toStrictEqual([
    'startup|resume: boxxy hook session-start',
  ]);
});

test('it registers the pull request hook on Bash calls', () => {
  const ctx = setupTest();

  expect(ctx.listCommands('PostToolUse')).toStrictEqual(['Bash: boxxy hook post-tool-use']);
});

test('it names, for every hook of the manifest, a command that the CLI has', () => {
  const ctx = setupTest();
  const lines = Object.values(ctx.parsed.hooks).flat();
  const commands = lines.flatMap((entry) => entry.hooks.map((hook) => hook.command));

  const kinds = commands.map((command) => {
    const words = command.split(' ').slice(1);

    return pickCommand(allCommands, words).kind;
  });

  expect(kinds).toStrictEqual(['command', 'command']);
});

test('it holds one command for each hook procedure', () => {
  const procedures = hookCommands.map((command) => command.procedure);

  expect(procedures).toStrictEqual(['attempt.bindSession', 'attempt.recordPullRequest']);
});
