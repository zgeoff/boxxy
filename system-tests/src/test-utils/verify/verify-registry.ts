import { join } from 'node:path';
import { createWringer, local } from '@wringer/core';
import type { Wringer } from '@wringer/core';
import { http } from '@wringer/http';
import { z } from 'zod';
import { expectEqual } from './expect-equal.ts';
import { featurePaths, ignoredPaths } from './feature-paths.ts';
import { controlRoutes } from './harness/control-routes.ts';
import { fileItem } from './harness/file-item.ts';
import { landItem } from './harness/land-item.ts';
import { runSession } from './harness/run-session.ts';
import { closeOutPresetSchema, costSchema, itemShowSchema, timesSchema } from './harness/types.ts';
import { postControl } from './post-control.ts';
import { runBoxxy } from './run-boxxy.ts';

// The registry's name is not `boxxy`: gunshi reads a command group named like the program as the
// program itself, so `boxxy item` would lose its flags.
export const verifyRegistry: Wringer = createWringer({ name: 'boxxy-verify' })
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
          ? {
              web: String(line['control']),
              boxxy: String(line['boxxy']),
              skills: String(line['skills']),
            }
          : null,
    }),

    // `web` is the http driver's endpoint: the harness's control routes
    drivers: { http: () => ({ healthPath: '/control/health' }) },
  })

  // Writes. A step that the owner or a session takes runs the real `boxxy` CLI as a process. A
  // step that only the harness can take (time, the worker, the forge, pepys) goes to a control
  // route.
  .action({
    name: 'file-item',
    summary: 'File an item on example/app with `boxxy item file`; it becomes the current item',
    effect: 'write',
    input: z.strictObject({ title: z.string().min(1) }),
    data: z.strictObject({ item: z.string() }),
    run: (input, ctx) => fileItem(ctx, input),
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
    data: z.strictObject({
      id: z.string(),
      phase: z.string(),
      state: z.string(),
      outcome: z.string().nullable(),
    }),
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
      const shown = await runBoxxy(ctx, {
        argv: ['item', 'show', '@current'],
        schema: itemShowSchema,
      });

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

  // the doctor: the harness sends a status call through the broker route, the store answers, and
  // pepys under test answers a query. A check runs no process, so it cannot run the CLI.
  .check({
    name: 'boxxy',
    input: z.strictObject({}),
    data: z.null(),
    timeoutMs: 10_000,
    run: async (_input, ctx) => {
      await postControl(ctx, controlRoutes.health, null);

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
      summary:
        'boxxy claims an item for triage, a session binds and closes out, and the attempt settles',
      paths: featurePaths['claim-settle'],
    },
    {
      name: 'report-cost',
      summary: 'An item whose pull request merged reports its cost and stage times from pepys',
      paths: featurePaths['report-cost'],
    },
  )
  .ignore(...ignoredPaths)
  .build();
