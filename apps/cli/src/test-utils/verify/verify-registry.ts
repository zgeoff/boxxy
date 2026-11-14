import { join } from 'node:path';
import { createWringer, local } from '@wringer/core';
import type { Wringer } from '@wringer/core';
import { http } from '@wringer/http';
import { z } from 'zod';
import { expectEqual } from './expect-equal.ts';
import { featurePaths, ignoredPaths } from './feature-paths.ts';
import { controlRoutes } from './harness/control-routes.ts';
import { fileClosedItem } from './harness/file-closed-item.ts';
import { fileItem } from './harness/file-item.ts';
import { landItem } from './harness/land-item.ts';
import { readItemByTitle } from './harness/read-item-by-title.ts';
import { readSessionItem } from './harness/read-session-item.ts';
import { runPlanLever } from './harness/run-plan-lever.ts';
import { runSession } from './harness/run-session.ts';
import {
  closeOutPresetSchema,
  costSchema,
  itemShowSchema,
  sessionItemShowSchema,
  statusSchema,
  timesSchema,
} from './harness/types.ts';
import { pickHoldState } from './pick-hold-state.ts';
import { postControl } from './post-control.ts';
import { runBoxxy } from './run-boxxy.ts';

const noticeReasonsSchema = z.strictObject({ notices: z.array(z.string()) });

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
    name: 'file-closed-item',
    summary:
      'File an item on example/app and close it, with `boxxy item file` and `boxxy item close`; the current item stays',
    effect: 'write',
    input: z.strictObject({ title: z.string().min(1) }),
    data: z.strictObject({ item: z.string() }),
    run: (input, ctx) => fileClosedItem(ctx, input),
  })
  .action({
    name: 'file-item-beside',
    summary:
      'File an item on example/app with `boxxy item file`; it becomes the current item, and the current item before it stays open',
    effect: 'write',
    input: z.strictObject({ title: z.string().min(1) }),
    data: z.strictObject({ item: z.string() }),
    run: (input, ctx) => fileItem(ctx, { ...input, keepPrevious: true }),
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

      // `opened`: a `built` or `blocked` close-out links the pull request of `open-pull-request`
      pullRequest: z.enum(['opened']).optional(),
    }),
    data: z.strictObject({
      id: z.string(),
      phase: z.string(),
      state: z.string(),
      outcome: z.string().nullable(),
    }),
    timeoutMs: 30_000,
    run: async (input, ctx) => {
      const opened =
        input.pullRequest === undefined
          ? null
          : await postControl(ctx, controlRoutes.readOpenedPullRequest, null);

      return runSession(ctx, {
        closeOut: input.closeOut,
        minutes: input.minutes,
        pullRequest: opened?.number ?? null,
      });
    },
  })
  .action({
    name: 'open-pull-request',
    summary: 'Open the next pull request on the fake forge, which a later run-session can link',
    effect: 'write',
    input: z.strictObject({}),
    data: z.strictObject({ pullRequest: z.number() }),
    run: async (_input, ctx) => {
      const opened = await postControl(ctx, controlRoutes.openPullRequest, null);

      return { pullRequest: opened.number };
    },
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

  .action({
    name: 'tick',
    summary: 'Run one runner tick at the harness clock, with no wait and no session',
    effect: 'write',
    input: z.strictObject({}),
    data: z.null(),
    run: async (_input, ctx) => {
      await postControl(ctx, controlRoutes.tick, null);

      return null;
    },
  })
  .action({
    name: 'plan-lever',
    summary:
      'Run `boxxy expedite`, `boxxy defer` or `boxxy undefer` on the open item that has the title',
    effect: 'write',
    input: z.strictObject({ lever: z.enum(['expedite', 'defer', 'undefer']), title: z.string() }),
    data: z.null(),
    run: (input, ctx) => runPlanLever(ctx, input),
  })
  .action({
    name: 'runner-pause',
    summary: 'Pause the runner with `boxxy runner pause`',
    effect: 'write',
    input: z.strictObject({}),
    data: statusSchema,
    run: (_input, ctx) => runBoxxy(ctx, { argv: ['runner', 'pause'], schema: statusSchema }),
  })
  .action({
    name: 'runner-resume',
    summary: 'Resume the runner with `boxxy runner resume`',
    effect: 'write',
    input: z.strictObject({}),
    data: statusSchema,
    run: (_input, ctx) => runBoxxy(ctx, { argv: ['runner', 'resume'], schema: statusSchema }),
  })
  .action({
    name: 'register-notices',
    summary: 'Register the session that gets each hold notice with `boxxy notices register`',
    effect: 'write',
    input: z.strictObject({ session: z.string().min(1) }),
    data: z.unknown(),
    run: (input, ctx) =>
      runBoxxy(ctx, { argv: ['notices', 'register', input.session], schema: z.unknown() }),
  })
  .action({
    name: 'retry-item',
    summary: 'Run `boxxy item retry --phase` on the current item, which lifts its hold',
    effect: 'write',
    input: z.strictObject({ phase: z.string().min(1) }),
    data: z.unknown(),
    run: (input, ctx) =>
      runBoxxy(ctx, {
        argv: ['item', 'retry', '@current', '--phase', input.phase],
        schema: z.unknown(),
      }),
  })

  // Reads. Each runs the real CLI, as the owner on the current item or as the last session, and
  // fails with `check-failed` when a value differs from the one the journey names.
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
    path: ['boxxy', 'attempts'],
    summary:
      'Check how many attempts the open item with --title has, of --phase when it is given, from `boxxy item show`',
    effect: 'read',
    args: z.strictObject({
      title: z.string(),
      count: z.number().int().nonnegative(),
      phase: z.string().optional(),
    }),
    data: itemShowSchema,
    run: async (args, ctx) => {
      const id = await readItemByTitle(ctx, args.title);
      const shown = await runBoxxy(ctx, { argv: ['item', 'show', id], schema: itemShowSchema });

      const attempts = shown.attempts.filter(
        (attempt) => args.phase === undefined || attempt.phase === args.phase,
      );

      expectEqual(`the attempts of "${args.title}"`, attempts.length, args.count);

      return shown;
    },
  })
  .command({
    path: ['boxxy', 'hold'],
    summary:
      'Check from `boxxy item show` that the current item is `held` for --reason, or that the hold of --reason is `lifted`',
    effect: 'read',
    args: z.strictObject({ reason: z.string(), state: z.enum(['held', 'lifted']) }),
    data: itemShowSchema,
    run: async (args, ctx) => {
      const shown = await runBoxxy(ctx, {
        argv: ['item', 'show', '@current'],
        schema: itemShowSchema,
      });

      const hold = pickHoldState(shown.item.derived, args.reason);

      expectEqual(`the hold for ${args.reason}`, hold, args.state);

      return shown;
    },
  })
  .command({
    path: ['boxxy', 'status'],
    summary: 'Check whether the runner is `paused` or `running`, from `boxxy status`',
    effect: 'read',
    args: z.strictObject({ state: z.enum(['paused', 'running']) }),
    data: statusSchema,
    run: async (args, ctx) => {
      const status = await runBoxxy(ctx, { argv: ['status'], schema: statusSchema });

      const runner = status.paused ? 'paused' : 'running';

      expectEqual('the runner', runner, args.state);

      return status;
    },
  })
  .command({
    path: ['boxxy', 'notices'],
    summary:
      "Check the hold notices that the harness's notifier sent for the current item: how many, why, and to which session",
    effect: 'read',
    args: z.strictObject({
      count: z.number().int().nonnegative(),
      reason: z.string(),
      session: z.string(),
    }),
    data: noticeReasonsSchema,
    run: async (args, ctx) => {
      const current = await postControl(ctx, controlRoutes.readCurrent, null);
      const sent = await postControl(ctx, controlRoutes.readNotices, null);

      const mine = sent.notices.filter((notice) => notice.item === current.item);

      expectEqual('the notices sent for the item', mine.length, args.count);

      for (const notice of mine) {
        expectEqual('the notice reason', notice.reason, args.reason);
        expectEqual('the notice session', notice.session, args.session);
      }

      return { notices: mine.map((notice) => notice.reason) };
    },
  })
  .command({
    path: ['boxxy', 'session-item'],
    summary:
      'As the session of the last run-session, find the one item that holds --text with `boxxy attempt list-items`, and check its title with `boxxy attempt show-item`',
    effect: 'read',
    args: z.strictObject({ text: z.string(), title: z.string() }),
    data: sessionItemShowSchema,
    run: (args, ctx) => readSessionItem(ctx, args),
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
      summary: 'boxxy claims an item, a session closes out, and the attempt settles',
      paths: featurePaths['claim-settle'],
    },
    {
      name: 'report-cost',
      summary: 'A merged item reports its cost and stage times',
      paths: featurePaths['report-cost'],
    },
    {
      name: 'plan-ordering',
      summary: 'Expedite and defer set which item the runner claims',
      paths: featurePaths['plan-ordering'],
    },
    {
      name: 'runner-pause',
      summary: 'A paused runner claims nothing',
      paths: featurePaths['runner-pause'],
    },
    {
      name: 'hold-notice',
      summary: 'A held item sends one notice to the notice session',
      paths: featurePaths['hold-notice'],
    },
    {
      name: 'hold-recovery',
      summary: 'A retry lifts a hold and runs the chosen phase',
      paths: featurePaths['hold-recovery'],
    },
  )
  .ignore(...ignoredPaths)
  .build();
