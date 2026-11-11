import type { LoadRejection, LoadRejectionReason } from '@boxxy/model';
import { formatKeyPath } from '@boxxy/model';
import { rulesFileName } from './constants.ts';

export function buildRejection(
  path: readonly PropertyKey[],
  reason: LoadRejectionReason,
): LoadRejection {
  return { file: rulesFileName, path: formatKeyPath(path), reason };
}
