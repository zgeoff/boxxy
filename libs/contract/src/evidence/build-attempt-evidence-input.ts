import { z } from 'zod';

// `session` is the session reference every call from inside a session carries
export function buildAttemptEvidenceInput<Session extends z.ZodType>(session: Session) {
  return z
    .object({
      session,
      kind: z.enum(['test', 'ci-run', 'live-check', 'check', 'verdict']),
      ref: z
        .string()
        .min(1)
        .max(1000)
        .describe(
          'What was checked. A test file and name, a CI run URL or the command of a live check. For a check, the name of the CI check, such as "pr / checks". For a verdict, the name of the verify feature, such as "file-item".',
        ),
      observed: z
        .string()
        .min(1)
        .max(2000)
        .optional()
        .describe('What was seen, such as "42 passed". Leave it out for a check or a verdict.'),
    })
    .superRefine((input, ctx) => {
      if (input.observed !== undefined && (input.kind === 'check' || input.kind === 'verdict')) {
        ctx.addIssue({
          code: 'custom',
          path: ['observed'],
          message: `a ${input.kind} takes no observed text: the server reads the result itself`,
        });
      }
    });
}
