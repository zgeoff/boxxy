import { z } from 'zod';

// The acceptance list that a close-out sets: the text of each criterion, which the settle numbers.
export const acceptanceDraftSchema = z.array(z.object({ text: z.string().min(1) }));
