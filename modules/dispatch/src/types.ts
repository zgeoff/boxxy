// Every time limit of dispatch that the rules file does not hold.
export interface DispatchTimeouts {
  // `starting` or `reconciling` with no session
  readonly spawnLostMinutes: number;

  // `waking` with no running session
  readonly resumeLostMinutes: number;

  // `closing` with a session that does not stop
  readonly closingGiveUpMinutes: number;

  // a `closing` session inside a turn is not stopped before this
  readonly stopGraceSeconds: number;

  // a session that runs on a `sleeping` attempt wakes over the cap this long after its request
  readonly seatlessSeconds: number;

  // a pool gives no pick this long after the worker refused a session for capacity
  readonly capacityBackoffSeconds: number;

  // agent mode: a session with no activity this long is stopped
  readonly stallMinutes: number;
  readonly keptSessionHours: number;
  readonly failedSessionHours: number;

  // the most a pool waits after `usage-limit`, when the reading gives no reset time
  readonly usageLimitBackoffHours: number;

  // how long the runner keeps stopping a stray session
  readonly strayHours: number;
}
