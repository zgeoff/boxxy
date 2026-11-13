import { claimStoreAttemptReaderCases } from './claim-store-attempt-reader-cases.ts';
import { claimStoreClaimCases } from './claim-store-claim-cases.ts';
import { claimStoreCloseCases } from './claim-store-close-cases.ts';
import { claimStoreCopyCases } from './claim-store-copy-cases.ts';
import { claimStoreExclusiveCases } from './claim-store-exclusive-cases.ts';
import { claimStoreGuardCases } from './claim-store-guard-cases.ts';
import { claimStoreHeldItemCases } from './claim-store-held-item-cases.ts';
import { claimStoreItemReaderCases } from './claim-store-item-reader-cases.ts';
import { claimStoreOutboxCases } from './claim-store-outbox-cases.ts';
import { claimStoreRaceCases } from './claim-store-race-cases.ts';
import { claimStoreRollbackCases } from './claim-store-rollback-cases.ts';
import { claimStoreSeatCases } from './claim-store-seat-cases.ts';
import { claimStoreSessionCases } from './claim-store-session-cases.ts';
import type { ClaimStoreCase } from './types.ts';

export const claimStoreContract: readonly ClaimStoreCase[] = [
  ...claimStoreExclusiveCases,
  ...claimStoreClaimCases,
  ...claimStoreGuardCases,
  ...claimStoreRollbackCases,
  ...claimStoreCopyCases,
  ...claimStoreCloseCases,
  ...claimStoreSeatCases,
  ...claimStoreItemReaderCases,
  ...claimStoreHeldItemCases,
  ...claimStoreAttemptReaderCases,
  ...claimStoreSessionCases,
  ...claimStoreOutboxCases,
  ...claimStoreRaceCases,
];
