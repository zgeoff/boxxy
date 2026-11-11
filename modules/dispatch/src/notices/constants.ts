export const noticeLimits = {
  // a row with this many tries is no longer sent, and stays listed in `runner.status`
  maxTries: 5,

  // the unsent rows one tick reads, tried or not
  readRows: 200,
} as const;
