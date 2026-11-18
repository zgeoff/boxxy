export const shipWatchLimits = {
  // the items one pass reads, least recently read first; the rest wait for the next pass
  itemsPerPass: 50,
} as const;
