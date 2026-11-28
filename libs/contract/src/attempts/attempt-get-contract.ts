import { attemptRowSchema } from '@boxxy/model';
import { z } from 'zod';
import { makeReadTool } from '../tools/make-read-tool.ts';

const id = z.string().min(1).max(64);
const notFound = { NOT_FOUND: { message: 'no such attempt', data: z.object({ attempt: id }) } };

// The owner's read of one attempt in full, with the launch prompt and the input that every other
// answer leaves out.
export const attemptGetContract = {
  get: makeReadTool(
    'attempt_get',
    'Returns one attempt in full, with its launch prompt, input and close-out.',
  )
    .errors(notFound)
    .input(z.object({ attempt: id.describe('The ID of the attempt, as item_get lists it.') }))
    .output(attemptRowSchema),
};
