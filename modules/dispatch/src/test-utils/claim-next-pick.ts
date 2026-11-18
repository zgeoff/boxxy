import type { PickedClaim } from '@boxxy/model';
import { claimNext } from '../claims/claim-next.ts';
import type { ClaimInput } from '../claims/types.ts';

// The claim that `claimNext` picked, with the skips it recorded left out; null when it picked none.
export async function claimNextPick(input: ClaimInput): Promise<PickedClaim | null> {
  const result = await claimNext(input);

  return result.pick;
}
