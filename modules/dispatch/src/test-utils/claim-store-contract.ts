import { claimStoreAttemptReaderCases } from './claim-store-attempt-reader-cases.ts';
import { claimStoreClaimCases } from './claim-store-claim-cases.ts';
import { claimStoreExclusiveCases } from './claim-store-exclusive-cases.ts';
import { claimStoreGuardCases } from './claim-store-guard-cases.ts';
import { claimStoreItemReaderCases } from './claim-store-item-reader-cases.ts';
import { claimStorePoolCases } from './claim-store-pool-cases.ts';
import { claimStoreRollbackCases } from './claim-store-rollback-cases.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreContract: readonly ClaimStoreCase[] = [
  ...claimStoreExclusiveCases,
  ...claimStoreClaimCases,
  ...claimStoreGuardCases,
  ...claimStoreRollbackCases,
  ...claimStorePoolCases,
  ...claimStoreItemReaderCases,
  ...claimStoreAttemptReaderCases,
];
