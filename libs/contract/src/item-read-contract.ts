import {
  noteRowSchema,
  pullRequestRowSchema,
  relationRowSchema,
  sessionItemListViewSchema,
  sessionItemViewSchema,
} from '@boxxy/model';
import { oc } from '@orpc/contract';
import { mcp } from '@orpc/mcp';
import { z } from 'zod';

const id = z.string().min(1).max(64);
const notFound = { NOT_FOUND: { message: 'no such item', data: z.object({ item: id }) } };
const noAttempt = z.object({ kind: z.literal('refused'), reason: z.literal('no-attempt') });

// A session reads the items of its own item's repo, held items left out, so it takes no repo and
// no `held` state.
const listItemsInput = z.object({
  state: z
    .enum(['idea', 'ready', 'blocked', 'running', 'waiting', 'done', 'archived'])
    .optional()
    .describe('Only items in this state.'),
  phase: id.optional().describe('Only items that stand at this phase.'),
  text: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Only items whose title, outcome or notes hold this text.'),
  label: z.string().min(1).max(50).optional().describe('Only items with this label.'),
  limit: z.number().int().min(1).max(50).default(20),
  after: id.optional().describe('The `next` value of the call before.'),
});

const listItemsOutput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('items'),
    repo: z.string(),
    items: z.array(sessionItemListViewSchema),
    next: id.nullable(),
  }),
  noAttempt,
]);

const getItemOutput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('item'),
    item: sessionItemViewSchema,
    notes: z.array(noteRowSchema),
    relations: z.array(relationRowSchema),
    pullRequests: z.array(pullRequestRowSchema),
  }),
  noAttempt,
]);

// A session's reads of other items, for triage to find a duplicate or an overlap. The repo is
// that of the session's own item, and a held item or one of another repo answers NOT_FOUND;
// v1-api-and-auth.md holds the whole rule.
export const itemReadContract = {
  listItems: oc
    .meta(
      mcp.tool({
        name: 'attempt_list_items',
        description:
          'Lists the items of the repo of this session, newest first, with their derived state and position. Held items are left out. Use it to find an item that asks for the same work or overlaps it.',
      }),
    )
    .input(listItemsInput)
    .output(listItemsOutput),

  getItem: oc
    .meta(
      mcp.tool({
        name: 'attempt_get_item',
        description:
          'Returns one item of the repo of this session with its body, position, notes, relations and pull requests.',
      }),
    )
    .errors(notFound)
    .input(z.object({ item: id.describe('The item ID, such as i-12.') }))
    .output(getItemOutput),
};
