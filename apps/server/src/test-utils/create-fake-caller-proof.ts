import type { CallerIdentity, CallerProof } from '@boxxy/model';

export interface FakeCallerProof extends CallerProof {
  // who every later request is from; null proves no request
  setCaller: (caller: CallerIdentity | null) => void;
}

// A proof that proves no request until the test names a caller.
export function createFakeCallerProof(): FakeCallerProof {
  let current: CallerIdentity | null = null;

  return {
    prove: () => Promise.resolve(current),
    setCaller: (caller) => {
      current = caller;
    },
  };
}
