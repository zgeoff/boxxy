import { signoffFindingsMaxChars } from '@boxxy/model';
import { z } from 'zod';
import { readTool } from '../tools/read-tool.ts';
import { writeTool } from '../tools/write-tool.ts';

const id = z.string().min(1).max(64);
const count = z.number().int();

const itemSignoffInput = z.object({
  item: id.describe('The item ID, such as i-12.'),
  head: id.describe('The head commit of the pull request, as signoff_list gave it.'),
  verdict: z.enum(['approve', 'send-back']),
  findings: z
    .string()
    .max(signoffFindingsMaxChars)
    .optional()
    .describe(
      'What the build agent must change. A send-back needs it, and the next build reads it whole.',
    ),
});

const itemSignoffErrors = {
  NOT_FOUND: { message: 'no such item', data: z.object({ item: id }) },
  ITEM_HELD: { message: 'the item is held; release it with item_release first' },
  NOT_AWAITING_SIGNOFF: { message: 'the item does not wait for a sign-off' },
  STALE_HEAD: {
    message: 'the pull request head is not the one that waits for a sign-off',
    data: z.object({ head: z.string() }),
  },
  FINDINGS_REQUIRED: { message: 'a send-back needs findings' },
};

const waitingItem = z.object({
  item: id,
  title: z.string(),
  pullRequest: z.object({ repo: z.string(), number: count }),
  head: z.string(),
  rules: z.array(z.string()),
  paths: z.array(z.string()),
  truncated: z.boolean(),
  since: z.number().describe('When the item reached the sign-off hold, in epoch milliseconds.'),
});

const signoffListOutput = z.object({ items: z.array(waitingItem) });

// Checks and writes in one store change. Writes `boxxy.lever.recorded` with a `signoff.approve`
// or `signoff.send-back` lever, which sends the item from the sign-off hold to the merge step.
export const itemSignoffContract = {
  signoff: writeTool(
    'item_signoff',
    'Answers an item that waits for the owner at merge: approve the head commit that signoff_list gave, or send the item back to the build agent with findings.',
  )
    .errors(itemSignoffErrors)
    .input(itemSignoffInput)
    .output(z.object({ lever: count })),
};

// Oldest first by when the item reached the sign-off hold. Writes nothing.
export const signoffContract = {
  list: readTool(
    'signoff_list',
    'Lists the items that wait for the owner to sign off a pull request at merge, each with the head commit to answer, the rules that matched and the changed paths that matched.',
  )
    .input(z.object({}))
    .output(signoffListOutput),
};
