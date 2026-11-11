import type { ErrorCode } from '@atcx/contract';
import { ERROR_CODES } from '@atcx/contract';
import { z } from 'zod';

// A call that atc refused: its code, and the `problem` that a host refusal carries in its data.
export interface AtcError {
  readonly code: ErrorCode;
  readonly problem: string | null;
  readonly message: string;
}

const atcErrorSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string().optional(),
  data: z.unknown(),
});

const problemSchema = z.object({ problem: z.string() });

// null: the error carries no atc code, such as a dropped connection, so atc gave no answer
export function parseAtcError(error: unknown): AtcError | null {
  const parsed = atcErrorSchema.safeParse(error);

  if (!parsed.success) {
    return null;
  }

  const data = problemSchema.safeParse(parsed.data.data);

  return {
    code: parsed.data.code,
    problem: data.success ? data.data.problem : null,
    message: parsed.data.message ?? '',
  };
}
