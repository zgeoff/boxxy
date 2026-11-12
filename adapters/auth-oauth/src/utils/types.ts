// Copied from atc: packages/core/src/types.ts at commit 4fe647cf.

export interface AuthClock {
  readonly now: () => number;

  // runs the callback once after the delay; the returned function cancels it
  readonly schedule: (callback: () => void, delayMs: number) => () => void;
}
