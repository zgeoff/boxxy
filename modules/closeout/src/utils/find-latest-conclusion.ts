import type { AttemptRow } from '@boxxy/model';
import { designCloseOutSchema } from '@boxxy/model';
import { findLatestCloseOut } from './find-latest-close-out.ts';

export function findLatestConclusion(history: readonly AttemptRow[]): string | null {
  const closeOut = findLatestCloseOut(history, 'design', designCloseOutSchema);

  return closeOut?.result.kind === 'designed' ? (closeOut.result.conclusion ?? null) : null;
}
