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

    // design sketches that keep the layout of the design review
    'docs/design/boxxy/sketches/**',
  ],
});
