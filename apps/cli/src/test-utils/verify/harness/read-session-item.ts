import invariant from 'tiny-invariant';
import { expectEqual } from '../expect-equal.ts';
import { runBoxxy } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';
import { sessionItemListSchema, sessionItemShowSchema } from './types.ts';

interface ReadSessionItemInput {
  readonly text: string;
  readonly title: string;
}

// Each run of the claim-settle journey files one more closed item with the same title, so the list
// can hold more than one, and the read checks the title of each.
export async function readSessionItem(ctx: VerifyContext, input: ReadSessionItemInput) {
  const listed = await runBoxxy(ctx, {
    argv: ['attempt', 'list-items', '--text', input.text],
    schema: sessionItemListSchema,
  });

  expectEqual('whether the session listed an item', listed.items.length > 0, true);

  const shown = [];

  for (const item of listed.items) {
    const read = await runBoxxy(ctx, {
      argv: ['attempt', 'show-item', item.id],
      schema: sessionItemShowSchema,
    });

    expectEqual('the shown title', read.item.title, input.title);

    shown.push(read);
  }

  const [first] = shown;

  invariant(first !== undefined, 'the empty-list check leaves one shown item');

  return first;
}
