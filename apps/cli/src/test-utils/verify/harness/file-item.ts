import { z } from 'zod';
import { postControl } from '../post-control.ts';
import { runBoxxy } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';
import { controlRoutes } from './control-routes.ts';

interface FileItemInput {
  readonly title: string;

  // true: the current item before this one stays open beside it
  readonly keepPrevious?: boolean;
}

// Files an item on example/app through the real CLI. The item becomes the current one, and the
// one before it closes, unless `keepPrevious` leaves it open.
export async function fileItem(
  ctx: VerifyContext,
  input: FileItemInput,
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
      '--acceptance',
      `${input.title} works.`,
    ],
    schema: z.object({ item: z.string() }),
  });

  await postControl(ctx, controlRoutes.setCurrent, {
    item: filed.item,
    keepPrevious: input.keepPrevious ?? false,
  });

  return { item: filed.item };
}
