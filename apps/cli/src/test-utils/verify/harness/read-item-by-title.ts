import { WringerError } from '@wringer/core';
import { runBoxxy } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';
import { itemListSchema } from './types.ts';

// The ID of the open item with the title, found with `boxxy item list` as the owner.
export async function readItemByTitle(ctx: VerifyContext, title: string): Promise<string> {
  const listed = await runBoxxy(ctx, { argv: ['item', 'list'], schema: itemListSchema });

  const found = listed.items.find((item) => item.title === title);

  if (found === undefined) {
    throw new WringerError('check-failed', { message: `no open item has the title "${title}"` });
  }

  return found.id;
}
