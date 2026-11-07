import type { LoadRejection, LoadRejectionReason } from '@boxxy/model';
import { rulesFileName } from './constants.ts';
import { formatRulesPath } from './format-rules-path.ts';

export function buildRejection(
  path: readonly PropertyKey[],
  reason: LoadRejectionReason,
): LoadRejection {
  return { file: rulesFileName, path: formatRulesPath(path), reason };
}
