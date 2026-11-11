import type { AttemptRow, DesignRef } from '@boxxy/model';
import { designCloseOutSchema } from '@boxxy/model';
import { findLatestCloseOut } from './find-latest-close-out.ts';

export function findLatestDesign(history: readonly AttemptRow[]): DesignRef | null {
  const closeOut = findLatestCloseOut(history, 'design', designCloseOutSchema);

  return closeOut?.result.kind === 'designed' ? closeOut.result.design : null;
}
