export const shipWatchLimits = {
  // the items one pass reads, oldest filed first; the rest wait for the next pass
  itemsPerPass: 50,
} as const;
