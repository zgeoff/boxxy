import { runPostToolUseHook } from '../hooks/run-post-tool-use-hook.ts';
import { runSessionStartHook } from '../hooks/run-session-start-hook.ts';
import type { Command } from '../types.ts';

// The hook plug-in in the agent image runs these. Each reads Claude Code's hook payload on stdin.
export const hookCommands: readonly Command[] = [
  {
    path: ['hook', 'session-start'],
    procedure: 'attempt.bindSession',
    summary: 'Fetches the pinned skills, then binds the agent session to its attempt.',
    options: {},
    run: runSessionStartHook,
  },
  {
    path: ['hook', 'post-tool-use'],
    procedure: 'attempt.recordPullRequest',
    summary: 'Links the pull request that `gh pr create` printed to the attempt.',
    options: {},
    run: runPostToolUseHook,
  },
];
