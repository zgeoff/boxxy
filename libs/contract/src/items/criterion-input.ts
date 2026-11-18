import { z } from 'zod';

const text50 = z.string().min(1).max(50);
const text1000 = z.string().min(1).max(1000);

// An entry that names the `id` of a criterion keeps that criterion's evidence; an entry with no
// `id` is a new criterion.
const criterionTags = z
  .array(text50)
  .max(10)
  .describe('Tags from the rules file; an unlisted tag is refused.');

export const criterionInput = z.object({
  id: z.string().min(1).max(64).optional().describe('The ID of an existing criterion to keep.'),
  text: text1000,
  tags: criterionTags
    .optional()
    .describe('The whole new tag list; left out, a kept criterion keeps its tags.'),
});

// a plain string is a line with no tags
export const criterionDraftInput = z.union([
  text1000,
  z.object({ text: text1000, tags: criterionTags.optional() }),
]);
