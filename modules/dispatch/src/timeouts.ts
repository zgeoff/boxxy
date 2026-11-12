import type { DispatchTimeouts } from './types.ts';

export const timeouts: DispatchTimeouts = {
  spawnLostMinutes: 10,
  resumeLostMinutes: 10,
  closingGiveUpMinutes: 10,
  stopGraceSeconds: 60,

  // two ticks of the runner's 5-second loop: the reconcile table reads the time, not a tick count
  seatlessSeconds: 10,
  capacityBackoffSeconds: 60,
  stallMinutes: 30,
  keptSessionHours: 24,
  failedSessionHours: 24,
  usageLimitBackoffHours: 24,
  strayHours: 24,
  jobReadSeconds: 30,
  actRetryMinutes: 5,
};
