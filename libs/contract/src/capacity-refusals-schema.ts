import { z } from 'zod';

// The latest spawn that atc refused for capacity, and how many such refusals there are since a
// session last started. `code`, `problem` and `message` are null when atc gave no answer.
export const capacityRefusalsSchema = z.object({
  latest: z
    .object({
      at: z.iso.datetime({ offset: true }),
      code: z.string().nullable(),
      problem: z.string().nullable(),
      message: z.string().nullable(),
    })
    .nullable(),
  sinceLastSpawn: z.number().int(),
});
