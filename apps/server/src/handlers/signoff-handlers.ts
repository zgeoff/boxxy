import { findSignoffWait } from '@boxxy/model';
import { api } from './api.ts';

// The owner's read of the items that wait for a sign-off at merge.
export const signoffHandlers = {
  list: api.signoff.list.handler(async (options) => {
    const deps = options.context.deps;
    const rules = deps.rulesState().rules;
    const now = deps.clock.now();

    const waiting = await deps.store.read(async (tx) => {
      const items = await tx.listItems({ state: 'waiting' }, now, rules);

      return Promise.all(
        items.map(async (item) => ({
          item,
          wait: findSignoffWait({
            pipeline: rules.kinds.get(item.kind)?.pipeline ?? null,
            position: item.position,
            attempts: await tx.listItemAttempts(item.id),
          }),
        })),
      );
    });

    const items = waiting.flatMap((entry) => {
      const wait = entry.wait;

      return wait === null
        ? []
        : [
            {
              item: entry.item.id,
              title: entry.item.title,
              pullRequest: wait.pullRequest,
              head: wait.head,
              rules: [...wait.rules],
              paths: [...wait.paths],
              truncated: wait.truncated,
              since: wait.since,
            },
          ];
    });

    return {
      items: items.toSorted((first, second) => first.since - second.since),
    };
  }),
};
