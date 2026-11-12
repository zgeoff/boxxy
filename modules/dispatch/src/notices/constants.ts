export const noticeLimits = {
  // the rows one tick reads, due or not
  readRows: 200,

  // the wait after the first try; each later wait doubles
  firstWaitMs: 5000,

  // the longest wait between two tries of one row
  longestWaitMs: 900_000,

  // uncertain tries under one key before the row takes a new key
  uncertainTriesPerKey: 3,
} as const;
