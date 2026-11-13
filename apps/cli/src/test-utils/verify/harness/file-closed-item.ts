import { z } from 'zod';
import { runBoxxy } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';

interface FileClosedItemInput {
  readonly title: string;
}

// Files an item on example/app and closes it at once, both through the real CLI, so a later
// session has another item of its repo to read. A closed item takes no seat, so the other
// journeys of the run claim as before. The current item stays as it was.
export async function fileClosedItem(
  ctx: VerifyContext,
  input: FileClosedItemInput,
): Promise<{ item: string }> {
  const filed = await runBoxxy(ctx, {
    argv: [
      'item',
      'file',
      '--repo',
      'example/app',
      '--title',
      input.title,
      '--outcome',
      `${input.title}.`,
    ],
    schema: z.object({ item: z.string() }),
  });

  await runBoxxy(ctx, {
    argv: ['item', 'close', filed.item, '--reason', 'Done before this journey.'],
    schema: z.unknown(),
  });

  return { item: filed.item };
}
