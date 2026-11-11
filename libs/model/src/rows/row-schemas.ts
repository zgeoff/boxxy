import type { z } from 'zod';
import type { TableName, Tables } from '../ports/types.ts';
import { attemptRowSchema } from './attempt-row-schema.ts';
import { attemptSessionRowSchema } from './attempt-session-row-schema.ts';
import { decisionRowSchema } from './decision-row-schema.ts';
import { evidenceRowSchema } from './evidence-row-schema.ts';
import { itemRowSchema } from './item-row-schema.ts';
import { leaseRowSchema } from './lease-row-schema.ts';
import { leverRowSchema } from './lever-row-schema.ts';
import { noteRowSchema } from './note-row-schema.ts';
import { noticeRowSchema } from './notice-row-schema.ts';
import { pullRequestRowSchema } from './pull-request-row-schema.ts';
import { relationRowSchema } from './relation-row-schema.ts';
import { runnerRowSchema } from './runner-row-schema.ts';

// The schema of each table that a row write may name, for a store that reads rows back.
export const rowSchemas: { readonly [T in TableName]: z.ZodType<Tables[T]> } = {
  items: itemRowSchema,
  relations: relationRowSchema,
  levers: leverRowSchema,
  attempts: attemptRowSchema,
  attempt_sessions: attemptSessionRowSchema,
  leases: leaseRowSchema,
  decisions: decisionRowSchema,
  evidence: evidenceRowSchema,
  pull_requests: pullRequestRowSchema,
  runners: runnerRowSchema,
  notes: noteRowSchema,
  notices: noticeRowSchema,
};
