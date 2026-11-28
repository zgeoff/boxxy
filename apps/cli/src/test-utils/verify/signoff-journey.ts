import { z } from 'zod';
import { defineVerify } from './define-verify.ts';
import { expectEqual } from './expect-equal.ts';
import { controlRoutes } from './harness/control-routes.ts';
import { itemShowSchema } from './harness/types.ts';
import { postControl } from './post-control.ts';
import { runBoxxy } from './run-boxxy.ts';

const promptAttemptSchema = z.object({ spawnRequest: z.object({ prompt: z.string() }) });
const listedAttemptSchema = z.object({ id: z.string(), phase: z.string() });
const attemptListSchema = z.object({ attempts: z.array(listedAttemptSchema) });

const waitingItemSchema = z.object({
  item: z.string(),
  head: z.string(),
  rules: z.array(z.string()),
  paths: z.array(z.string()),
});

const signoffListSchema = z.object({ items: z.array(waitingItemSchema) });

// The journey of the owner-signoff feature: the steps that take an item to the sign-off hold, and
// the reads that check where it stands.
export const signoffJourney = {
  holdAtSignoff: defineVerify.defineAction({
    name: 'hold-at-signoff',
    summary:
      'File an item whose pull request edits a path that a sign-off rule matches, and take it through a passed review and a merge attempt that holds it for the owner; it becomes the current item, under rules that ask for a sign-off',
    effect: 'write',
    targets: ['local'],
    input: z.strictObject({}),
    data: z.strictObject({ item: z.string(), head: z.string(), pullRequest: z.number() }),
    timeoutMs: 30_000,
    run: (_input, ctx) => postControl(ctx, controlRoutes.holdAtSignoff, null),
  }),
  pushCommit: defineVerify.defineAction({
    name: 'push-commit',
    summary:
      'Push one commit to the opened pull request, with its checks green, as a build that answers the findings does',
    effect: 'write',
    targets: ['local'],
    input: z.strictObject({}),
    data: z.strictObject({ head: z.string() }),
    run: (_input, ctx) => postControl(ctx, controlRoutes.pushCommit, null),
  }),
  signoffItem: defineVerify.defineAction({
    name: 'signoff-item',
    summary:
      'Answer the current item with `boxxy item signoff` at --head: approve it, or send it back with --findings',
    effect: 'write',
    targets: ['local'],
    input: z.strictObject({
      verdict: z.enum(['approve', 'send-back']),
      head: z.string().min(1),
      findings: z.string().min(1).optional(),
    }),
    data: z.unknown(),
    run: (input, ctx) =>
      runBoxxy(ctx, {
        argv: [
          'item',
          'signoff',
          '@current',
          '--head',
          input.head,
          '--verdict',
          input.verdict,
          ...(input.findings === undefined ? [] : ['--findings', input.findings]),
        ],
        schema: z.unknown(),
      }),
  }),
  signoff: defineVerify.defineCommand({
    path: ['boxxy', 'signoff'],
    summary:
      'Check from `boxxy signoff list` how many items wait for a sign-off, and, when it is 1, the current item with its --head, --rule and --path',
    effect: 'read',
    args: z.strictObject({
      count: z.number().int().nonnegative(),
      head: z.string().optional(),
      rule: z.string().optional(),
      path: z.string().optional(),
    }),
    data: signoffListSchema,
    run: async (args, ctx) => {
      const listed = await runBoxxy(ctx, { argv: ['signoff', 'list'], schema: signoffListSchema });

      expectEqual('the items that wait for a sign-off', listed.items.length, args.count);

      const [waiting] = listed.items;

      if (args.head !== undefined) {
        expectEqual('the head that waits', waiting?.head, args.head);
      }

      if (args.rule !== undefined) {
        expectEqual('the rules that matched', waiting?.rules, [args.rule]);
      }

      if (args.path !== undefined) {
        expectEqual('the paths that matched', waiting?.paths, [args.path]);
      }

      return listed;
    },
  }),
  prompt: defineVerify.defineCommand({
    path: ['boxxy', 'prompt'],
    summary:
      "Check that the launch prompt of the current item's latest --phase attempt holds --text, from `boxxy item show` and `boxxy attempt get`",
    effect: 'read',
    args: z.strictObject({ phase: z.string(), text: z.string() }),
    data: promptAttemptSchema,
    run: async (args, ctx) => {
      const shown = await runBoxxy(ctx, {
        argv: ['item', 'show', '@current'],
        schema: attemptListSchema,
      });

      const latest = shown.attempts.findLast((attempt) => attempt.phase === args.phase);

      expectEqual(`the item has a ${args.phase} attempt`, latest !== undefined, true);

      const full = await runBoxxy(ctx, {
        argv: ['attempt', 'get', latest?.id ?? ''],
        schema: promptAttemptSchema,
      });

      expectEqual(
        `the prompt of the latest ${args.phase} attempt holds the text`,
        full.spawnRequest.prompt.includes(args.text),
        true,
      );

      return full;
    },
  }),
  merges: defineVerify.defineCommand({
    path: ['boxxy', 'merges'],
    summary:
      "Check the outcomes of the current item's merge attempts, oldest first, as a comma-separated list, from `boxxy item show` and `boxxy attempt get`",
    effect: 'read',
    args: z.strictObject({ outcomes: z.string() }),
    data: itemShowSchema,
    run: async (args, ctx) => {
      const shown = await runBoxxy(ctx, {
        argv: ['item', 'show', '@current'],
        schema: itemShowSchema,
      });

      const merges = shown.attempts
        .filter((attempt) => attempt.phase === 'merge')
        .map((attempt) => attempt.outcome ?? 'running');

      expectEqual('the merge outcomes', merges.join(','), args.outcomes);

      return shown;
    },
  }),
};
