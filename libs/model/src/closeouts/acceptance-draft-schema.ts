import { z } from 'zod';

// The acceptance list that a close-out sets: the text of each criterion and its tags, which the
// settle numbers. Each tag must be one the rules file lists.
const tagsSchema = z.array(z.string().min(1));

export const acceptanceDraftSchema = z.array(
  z.object({ text: z.string().min(1), tags: tagsSchema.exactOptional() }),
);
