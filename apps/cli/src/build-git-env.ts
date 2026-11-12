// the variables that `git rev-parse --local-env-vars` lists, which point git at a repository, a
// work tree or an index other than the folder git runs in, and the one that limits its search
const repositoryVariables = new Set([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_DIR',
  'GIT_GRAFT_FILE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_WORK_TREE',
]);

// The environment for a git that works only in the folder it is given. git never waits for a
// password, because a hook has no one to answer.
export function buildGitEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const kept = Object.entries(env).filter(([name]) => !repositoryVariables.has(name));

  return { ...Object.fromEntries(kept), GIT_TERMINAL_PROMPT: '0' };
}
