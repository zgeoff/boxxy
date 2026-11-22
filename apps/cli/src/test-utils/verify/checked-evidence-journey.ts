import { z } from 'zod';
import { defineVerify } from './define-verify.ts';
import { expectEqual } from './expect-equal.ts';
import { controlRoutes } from './harness/control-routes.ts';
import { evidenceShowSchema } from './harness/types.ts';
import { postControl } from './post-control.ts';
import { runBoxxy } from './run-boxxy.ts';

// The steps of the claim-settle journey that show the server reading a check and a verdict at the
// pull request's head.
export const checkedEvidenceJourney = {
  seedChecks: defineVerify.defineAction({
    name: 'seed-checks',
    summary:
      'Give the opened pull request a head where the check `pr / checks` and the verify gate passed, with a verify report that lists the feature file-item',
    effect: 'write',
    targets: ['local'],
    input: z.strictObject({}),
    data: z.strictObject({ head: z.string() }),
    run: (_input, ctx) => postControl(ctx, controlRoutes.seedChecks, null),
  }),
  evidence: defineVerify.defineCommand({
    path: ['boxxy', 'evidence'],
    summary:
      "Check that the current item's evidence holds a row of --kind and --ref that the server read at --head",
    effect: 'read',
    args: z.strictObject({ kind: z.string(), ref: z.string(), head: z.string() }),
    data: evidenceShowSchema,
    run: async (args, ctx) => {
      const shown = await runBoxxy(ctx, {
        argv: ['item', 'show', '@current'],
        schema: evidenceShowSchema,
      });

      const row = shown.evidence.find(
        (found) => found.kind === args.kind && found.ref === args.ref,
      );

      expectEqual(`the ${args.kind} ${args.ref} evidence's head`, row?.head, args.head);

      return shown;
    },
  }),
};
