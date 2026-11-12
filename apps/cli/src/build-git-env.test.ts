import { expect, test } from 'bun:test';
import { buildGitEnv } from './build-git-env.ts';

test('it drops the variables that point git at another repository and keeps the rest', () => {
  const env = buildGitEnv({
    GIT_DIR: '/tmp/boxxy-test/other.git',
    GIT_WORK_TREE: '/tmp/boxxy-test/other',
    GIT_INDEX_FILE: '/tmp/boxxy-test/index',
    GIT_OBJECT_DIRECTORY: '/tmp/boxxy-test/objects',
    GIT_ALTERNATE_OBJECT_DIRECTORIES: '/tmp/boxxy-test/alternates',
    GIT_COMMON_DIR: '/tmp/boxxy-test/common',
    GIT_CEILING_DIRECTORIES: '/tmp/boxxy-test',
    GIT_CONFIG_PARAMETERS: "'core.worktree'='/tmp/boxxy-test/other'",
    https_proxy: 'http://proxy.test:3128',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
  });

  expect(env).toStrictEqual({
    https_proxy: 'http://proxy.test:3128',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
    GIT_TERMINAL_PROMPT: '0',
  });
});
