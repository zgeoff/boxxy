// Design sketch. It is not compiled.
//
// 01-usage.ts: boxxy's verify CLI on wringer, as the repo would hold it.
//
//   A. The entry point and the root package.json.
//   B. The registry: the launch target, the actions, the reads, the doctor check, the features.
//   C. The path-to-feature map and the ignore list.
//   D. The feature map in the `verify` skill: the three journeys, as an agent runs them.
//
// The harness that `bun verify up` launches, and its control routes, are in 02-types.ts and
// 03-flow.ts. The entry, the registry, the map and the harness live in
// system-tests/src/test-utils/verify/. `chex test-layout` lets only a test or a test helper import
// a `test-utils` entry, and the harness imports four, so the whole verify CLI is a test helper of
// @boxxy/system-tests. Paths below are relative to that folder.

// ── A. The entry point ─────────────────────────────────────────────────────────────────────────
//
// verify/verify.ts, the template's entry as wringer ships it.

import { runVerify } from '@wringer/gunshi';
import { createVerifyRegistry } from './verify-registry.ts';

await runVerify(createVerifyRegistry(), { skill: '.claude/skills/verify' });

// The root package.json gains:
//
//   "scripts": {
//     "verify": "bun system-tests/src/test-utils/verify/verify.ts",
//     "verify:lint": "bun system-tests/src/test-utils/verify/verify.ts lint",
//     "ci:verify-gate": "bun scripts/ci/run-verify-gate.ts"
//   }
//
// system-tests/package.json gains "@wringer/core", "@wringer/gunshi" and "@wringer/http" as
// "catalog:", pinned at 0.2.0, the release that adds `.ignore(...)`. It already lists the @boxxy
// packages the harness imports.
//
// .gitignore gains `.wringer/`. The `zgeoff/import-zones` pins gain one edge: only
// @boxxy/system-tests imports `@wringer/*`.

// ── B. The registry ────────────────────────────────────────────────────────────────────────────
//
// verify/verify-registry.ts

import { join } from 'node:path';
import { createWringer, local } from '@wringer/core';
import type { Wringer } from '@wringer/core';
import { http } from '@wringer/http';
import { z } from 'zod';
import { expectEqual, runBoxxy } from './run-boxxy.ts';
import { featurePaths, ignoredPaths } from './feature-paths.ts';
import { landItem, runSession } from './harness/drive.ts';
import { closeOutPresetSchema, costSchema, itemShowSchema, timesSchema } from './harness/types.ts';

export function createVerifyRegistry(): Wringer {
  return (
    createWringer({ name: 'boxxy' })
      .use(http({}))
      .target('local', {
        mode: 'launch',
        access: 'read-write',
        host: local(),
        launch: (ctx) => ({
          command: ['bun', join(import.meta.dir, 'harness', 'main.ts')],

          // the SQLite store, the skills repo and each session's workspace go under the run
          // folder, so each `up` starts from nothing
          env: { BOXXY_VERIFY_DIR: ctx.runDirectory },
          ready: (line) =>
            line['event'] === 'listening'
              ? { web: String(line['control']), boxxy: String(line['boxxy']) }
              : null,
        }),

        // `web` is the http driver's endpoint: the harness's control routes
        drivers: { http: () => ({ healthPath: '/control/health' }) },
      })

      // Writes. A step that the owner or a session takes runs the real `boxxy` CLI as a process
      // (run-boxxy.ts). A step that only the harness can take (time, the worker, the forge,
      // pepys) goes to a control route.
      .action({
        name: 'file-item',
        summary: 'File an item on example/app with `boxxy item file`; it becomes the current item',
        effect: 'write',
        input: z.strictObject({ title: z.string().min(1) }),
        data: z.strictObject({ item: z.string() }),
        run: async (input, ctx) => {
          const filed = await runBoxxy(ctx, {
            argv: ['item', 'file', '--repo', 'example/app', '--title', input.title,
              '--outcome', `${input.title}.`, '--acceptance', `${input.title} works.`],
            schema: z.object({ item: z.string() }),
          });

          await ctx.drivers.http.request({
            method: 'POST',
            path: '/control/current',
            json: { item: filed.item },
          });

          return { item: filed.item };
        },
      })
      .action({
        name: 'run-session',
        summary:
          "Run one attempt of the current item: a tick claims it, the session's hook binds it, the session closes out with the preset, its turn ends, and two ticks settle it",
        effect: 'write',
        input: z.strictObject({
          closeOut: closeOutPresetSchema,

          // the session's work time on the harness clock
          minutes: z.number().int().positive(),
        }),
        data: z.strictObject({ phase: z.string(), state: z.string(), outcome: z.string().nullable() }),
        timeoutMs: 30_000,
        run: (input, ctx) => runSession(ctx, input),
      })
      .action({
        name: 'land-item',
        summary:
          'File an item and take it through triage, design, a build that opens a pull request, a passed review and the merge, with one model request in the build and one in the review',
        effect: 'write',
        input: z.strictObject({ title: z.string().min(1) }),
        data: z.strictObject({ item: z.string(), pullRequest: z.number() }),
        timeoutMs: 60_000,
        run: (input, ctx) => landItem(ctx, input),
      })

      // Reads. Each runs one owner command of the real CLI on the current item, and fails with
      // `check-failed` when a value differs from the one the journey names.
      .command({
        path: ['boxxy', 'item'],
        summary: "Check the current item's title, and the state and outcome of its --phase attempt",
        effect: 'read',
        args: z.strictObject({
          title: z.string(),
          phase: z.string().optional(),
          outcome: z.string().optional(),
        }),
        data: itemShowSchema,
        run: async (args, ctx) => {
          const shown = await runBoxxy(ctx, { argv: ['item', 'show', '@current'], schema: itemShowSchema });

          expectEqual('the title', shown.item.title, args.title);

          if (args.phase !== undefined) {
            const attempt = shown.attempts.find((row) => row.phase === args.phase);

            expectEqual(`the ${args.phase} attempt's state`, attempt?.state, 'succeeded');
            expectEqual(`the ${args.phase} attempt's outcome`, attempt?.outcome, args.outcome);
          }

          return shown;
        },
      })
      .command({
        path: ['boxxy', 'cost'],
        summary: "Check the current item's cost from pepys: the requests and the total in USD",
        effect: 'read',
        args: z.strictObject({ requests: z.number().int(), usd: z.number() }),
        data: costSchema,
        run: async (args, ctx) => {
          const cost = await runBoxxy(ctx, { argv: ['cost', '@current'], schema: costSchema });

          expectEqual('totals.requests', cost.totals.requests, args.requests);
          expectEqual('totals.costUSD', cost.totals.costUSD, args.usd);

          return cost;
        },
      })
      .command({
        path: ['boxxy', 'times'],
        summary: "Check the minutes of one step in the current item's stage times from pepys",
        effect: 'read',
        args: z.strictObject({ step: z.string(), minutes: z.number().int() }),
        data: timesSchema,
        run: async (args, ctx) => {
          const times = await runBoxxy(ctx, { argv: ['times', '@current'], schema: timesSchema });

          expectEqual(
            `the ${args.step} minutes`,
            times.steps.find((row) => row.step === args.step)?.minutes,
            args.minutes,
          );

          return times;
        },
      })

      // the doctor: boxxy answers the real CLI through the broker route, and pepys under test
      // answers the harness
      .check({
        name: 'boxxy',
        input: z.strictObject({}),
        data: z.null(),
        timeoutMs: 10_000,
        run: async (_input, ctx) => {
          await runBoxxy(ctx, { argv: ['status'], schema: z.unknown() });
          await ctx.drivers.http.request({ path: '/control/health' });

          return null;
        },
      })
      .feature(
        {
          name: 'file-item',
          summary: 'The owner files an item, and boxxy shows it',
          paths: featurePaths['file-item'],
        },
        {
          name: 'claim-settle',
          summary: 'boxxy claims an item for triage, a session binds and closes out, and the attempt settles',
          paths: featurePaths['claim-settle'],
        },
        {
          name: 'report-cost',
          summary: 'An item whose pull request merged reports its cost and stage times from pepys',
          paths: featurePaths['report-cost'],
        },
      )
      .ignore(...ignoredPaths)
      .build()
  );
}

// ── C. The path-to-feature map ─────────────────────────────────────────────────────────────────
//
// verify/feature-paths.ts. Globs are root-relative, as `git ls-files` prints them, and
// match with Bun.Glob.
//
// A package is in a feature when the feature's journey runs code in it. The harness runs the fakes
// in a package's src/test-utils/, so a package's whole folder maps, its test-utils included.

// Every journey files an item through the CLI and the server, and reads it back.
const everyJourney = [
  'apps/cli/**',
  'apps/server/**',
  'libs/**',
  'adapters/store-sqlite/**',

  // the example rules and their prompts, which the harness loads
  'modules/rules/**',
  'modules/dispatch/**',

  // the phase kinds, which the server loads with the rules, and the merge rule they drive
  'modules/closeout/**',
  'modules/train/**',

  // the verify CLI and its harness, the broker routing and pepys under test: a change here changes
  // what a journey proves
  'system-tests/src/test-utils/**',
] as const;

export const featurePaths = {
  'file-item': [...everyJourney],
  'claim-settle': [...everyJourney, 'modules/planning/**'],
  'report-cost': [...everyJourney, 'modules/planning/**', 'packages/pepys/**'],
} as const satisfies Record<string, readonly string[]>;

// A path one of these globs matches counts as no change, even where a feature's globs match it.
export const ignoredPaths = [
  // 1. No runtime effect: prose, tests and benches. Never `**/*.md`: the rules' prompts are
  //    markdown that the server sends to each session.
  'docs/**',
  '**/README.md',
  '**/CHANGELOG.md',
  'AGENTS.md',
  'CLAUDE.md',
  '**/LICENSE',
  '**/*.test.ts',
  '**/bench/**',
  'system-tests/e2e/**',

  // 2. Build, lint and repo wiring, which Bun never reads when it runs the source.
  '**/tsconfig*.json',
  '**/turbo.json',
  'bunfig.toml',
  'rig.config.ts',
  'knip.json',
  '.oxlintrc.json',
  'oxfmt.config.ts',
  '.formatignore',
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.gitleaks.toml',
  'commitlint.config.js',
  'lefthook.yml',
  '.lefthook/**',
  'audit-ignores.json',
  'socket.yml',
  'review.json',
  'renovate.json',

  // the skills, the verify skill's feature map among them
  '.claude/**',
  '.github/**',
  'scripts/**',

  // 3. The files that Renovate (the root catalog, the lock file, the Bun pin) and release-please
  //    (each package's version, the manifest) change. A patch or minor bump merges on green CI, and
  //    a major bump or a new Bun version gets the owner's review, with the system tests in CI.
  '**/package.json',
  'bun.lock',
  '.bun-version',
  '.release-please-manifest.json',
  'release-please-config.json',

  // 4. Code that no journey runs. The harness runs fakes in place of the four adapters, and
  //    composes the server itself, so the server's own start, config, timers and rules loader never
  //    run. The server's start tests on the stand-in atc and the live proof run them.
  'adapters/worker-atc/**',
  'adapters/caller-proof-imp/**',
  'adapters/notifier-atc/**',
  'adapters/forge-github/**',
  'apps/server/src/{main,start-server,no-caller-proof,create-capacity-backoff}.ts',
  'apps/server/src/config/**',
  'apps/server/src/rules/{create-rules-holder,read-rules-checkout}.ts',
  'apps/server/src/tick/start-tick-loop.ts',
  'apps/server/src/outbox/start-outbox-sender.ts',
] as const;

// ── D. The feature map in the `verify` skill ───────────────────────────────────────────────────
//
// .claude/skills/verify/references/feature-map.md. Each journey runs as written after
// `bun verify up` and `bun verify doctor`. Each files its own item, so the three run in any order
// on one run.
/*
## file-item

- **What:** the owner files an item, and boxxy shows it.
- **How a user reaches it:** `boxxy item file`, then `boxxy item show <item>`.
- **Journey:**

  ```bash
  bun verify use --feature file-item
  bun verify action file-item --title "Follow the system theme"
  bun verify boxxy item --title "Follow the system theme"
  ```

- **End state:** `boxxy item` exits 0. It exits 1 with `check-failed` when `item show` gives another
  title. `file-item` exits 1 when the server refuses the item.

## claim-settle

- **What:** boxxy claims a filed item for triage, a worker session binds and closes out, and the
  attempt settles with that outcome.
- **How a user reaches it:** the owner files an item; the runner tick does the rest.
- **Journey:**

  ```bash
  bun verify use --feature claim-settle
  bun verify action file-item --title "Read the system theme"
  bun verify action run-session --close-out accepted --minutes 4
  bun verify boxxy item --title "Read the system theme" --phase triage --outcome accepted
  ```

- **End state:** `boxxy item` exits 0: the item's triage attempt is `succeeded` with the outcome
  `accepted`. `run-session` fails with `check-failed` when no tick claims the item, the hook does
  not bind, the close-out is refused, or two ticks do not settle the attempt.

## report-cost

- **What:** an item whose pull request merged reports its cost and its stage times from pepys.
- **How a user reaches it:** `boxxy cost <item>` and `boxxy times <item>`.
- **Journey:**

  ```bash
  bun verify use --feature report-cost
  bun verify action land-item --title "Show the theme in the header"
  bun verify boxxy cost --requests 2 --usd 3
  bun verify boxxy times --step build --minutes 30
  bun verify boxxy times --step merge --minutes 20
  ```

- **End state:** each read exits 0: pepys reports 2 model requests that cost 3 USD in all, a build
  step of 30 minutes and a merge step of 20, the numbers that `land-item` scripts on the harness
  clock.
*/
