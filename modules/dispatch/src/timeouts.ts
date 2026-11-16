import type { DispatchTimeouts } from './types.ts';

export const timeouts: DispatchTimeouts = {
  spawnLostMinutes: 10,
  resumeLostMinutes: 10,
  closingGiveUpMinutes: 10,
  stopGraceSeconds: 60,

  // two ticks of the runner's 5-second loop: the reconcile table reads the time, not a tick count
  seatlessSeconds: 10,
  capacityBackoffSeconds: 60,

  // longer than a scheduled wakeup's 60-minute cap: atc counts only hook events as activity, so
  // an agent that waits on a wakeup, a background task or a long turn shows none until it ends
  stallMinutes: 120,
  keptSessionHours: 24,
  failedSessionHours: 24,
  usageLimitBackoffHours: 24,
  strayHours: 24,
  jobReadSeconds: 30,
  actRetryMinutes: 5,
};
