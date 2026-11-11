import config from '@zgeoff/oxfmt-config';
import { defineConfig } from 'oxfmt';

export default defineConfig({
  ...config,
  ignorePatterns: [
    ...config.ignorePatterns,

    // verbatim copies that repo-sync delivers from zgeoff/tools; edit them there
    '.claude/skills/docs-writing/**',
    '.claude/skills/testing/**',
    '.claude/hooks/skill-gate/**',

    // the pepys glue, which `pepys build` writes and its check compares byte for byte
    'packages/pepys/src/generated/**',

    // the design docs and decision records keep the wrapping and tables their authors gave them
    'docs/decisions/**',
    'docs/design/**',
  ],
});
