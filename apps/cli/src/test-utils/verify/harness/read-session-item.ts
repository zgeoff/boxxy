import invariant from 'tiny-invariant';
import { expectEqual } from '../expect-equal.ts';
import { runBoxxy } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';
import { sessionItemListSchema, sessionItemShowSchema } from './types.ts';

interface ReadSessionItemInput {
  readonly text: string;
  readonly title: string;
}

// As the session of the last `run-session`, finds the one item whose text matches with
// `boxxy attempt list-items`, and reads it with `boxxy attempt show-item`. It fails with
// `check-failed` when the list holds another count of items or the shown item another title.
export async function readSessionItem(ctx: VerifyContext, input: ReadSessionItemInput) {
  const listed = await runBoxxy(ctx, {
    argv: ['attempt', 'list-items', '--text', input.text],
    schema: sessionItemListSchema,
  });

  expectEqual('the count of listed items', listed.items.length, 1);

  const [item] = listed.items;

  invariant(item !== undefined, 'the count check leaves one listed item');

  const shown = await runBoxxy(ctx, {
    argv: ['attempt', 'show-item', item.id],
    schema: sessionItemShowSchema,
  });

  expectEqual('the shown title', shown.item.title, input.title);

  return shown;
}
