import { z } from 'zod';

// The latest attempt that atc refused for capacity, and how many such attempts there are since a
// session last started. `code`, `problem` and `message` are null for an attempt stored before
// boxxy kept atc's answer.
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
