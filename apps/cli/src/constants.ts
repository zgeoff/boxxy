// 2 means the command line is wrong, or the server has no attempt for this session yet
export const exitCodes = { ok: 0, failed: 1, usage: 2, retryLater: 2 } as const;

// The session-start hook can run before the server knows the session's caller, because the runner
// stores the caller after the worker answers the start. The hook asks again for this long.
export const callerWait = { tries: 6, delayMs: 5000 } as const;

// where the server's address is read from, and where a deployment points the skills fetch
export const envNames = {
  url: 'BOXXY_URL',
  skillsURL: 'BOXXY_SKILLS_URL',
} as const;

export const defaultSkillsURL = 'https://github.com';

// the folder of the skills repository that holds one folder per skill, and the folder of the
// workspace that the agent reads skills from
export const skillsRepoFolder = 'skills';
export const workspaceSkillsFolder = '.claude/skills';
