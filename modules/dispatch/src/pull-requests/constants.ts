export const watchLimits = {
  // The watch looks for the pull request of a succeeded build for this long after the build
  // ended; a build that opened none stops costing forge calls after it.
  linkWindowMs: 7 * 24 * 60 * 60 * 1000,
} as const;
