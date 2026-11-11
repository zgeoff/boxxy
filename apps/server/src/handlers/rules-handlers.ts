import { collectRetries, collectSettled } from '@boxxy/model';
import { dryRunRules } from '@boxxy/rules';
import { api } from './api.ts';

// The rules dry run loads the given rules file in place of the server's own, beside the server's
// prompts, and folds each open item under both rules sets. It writes nothing.
export const rulesHandlers = {
  dryRun: api.rules.dryRun.handler(async (options) => {
    const deps = options.context.deps;
    const proposed = deps.loadProposedRules(options.input.rules);

    if (proposed.kind === 'rejected') {
      return { kind: 'rejected', rejections: [...proposed.rejections] } as const;
    }

    const current = deps.rulesState().rules;
    const now = deps.clock.now();

    const items = await deps.store.read(async (tx) => {
      const open = await tx.listItems({}, now, current);

      return Promise.all(
        open
          .filter((item) => item.closedAt === null)
          .map(async (item) => {
            const attempts = await tx.listItemAttempts(item.id);

            return {
              item,
              attempts: collectSettled(attempts),
              retries: collectRetries(item.levers),
            };
          }),
      );
    });

    const lines = dryRunRules({ current, proposed: proposed.rules, items });

    return {
      kind: 'loaded',
      version: proposed.rules.version,
      moved: lines.filter((line) => line.moved).length,
      items: lines,
    } as const;
  }),
};
